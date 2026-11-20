// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {closeStream, readText} from './streams.js';

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export class CommandRunner {
    constructor() {
        this._stopped = false;
        this._processes = new Set();
    }

    _stop(record, error) {
        if (record.error)
            return;
        record.error = error;
        if (record.timer)
            GLib.Source.remove(record.timer);
        record.timer = 0;
        // GNU timeout forwards TERM to its process group, then KILL after 5s.
        try {
            if (!record.exited)
                record.process.send_signal(15);
        } catch (signalError) {
            console.warn(`Package Updates: could not terminate command: ${signalError.message}`);
        }
        record.cancellable.cancel();
    }

    async run(argv, environment = {}) {
        if (this._stopped)
            throw new Error('Command runner stopped.');
        const program = GLib.find_program_in_path(argv[0]);
        const timeout = GLib.find_program_in_path('timeout');
        if (!program)
            throw new Error(`Required command not found: ${argv[0]}`);
        if (!timeout)
            throw new Error('Install coreutils to provide timeout.');
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        launcher.setenv('LC_ALL', 'C', true);
        launcher.setenv('G_MESSAGES_DEBUG', '', true);
        for (const [name, value] of Object.entries(environment))
            launcher.setenv(name, value, true);
        let process;
        try {
            process = launcher.spawnv([
                timeout, '--kill-after=5s', '120s', program, ...argv.slice(1),
            ]);
        } finally {
            launcher.close();
        }
        const record = {process, cancellable: new Gio.Cancellable(), exited: false, error: null, timer: 0};
        this._processes.add(record);
        // Also bound pipe reads if a descendant keeps a descriptor open after exit.
        record.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 125, () => {
            record.timer = 0;
            this._stop(record, new Error(`${argv[0]} timed out after 120 seconds plus termination grace.`));
            return GLib.SOURCE_REMOVE;
        });
        const stdout = process.get_stdout_pipe();
        const stderr = process.get_stderr_pipe();
        let outputBytes = 0;
        const onBytes = length => {
            outputBytes += length;
            if (outputBytes > MAX_OUTPUT_BYTES)
                throw new Error(`${argv[0]} output exceeded 8 MiB.`);
        };
        const read = stream => readText(stream, record.cancellable, onBytes).catch(error => {
            this._stop(record, error);
            throw error;
        });
        // Never cancel wait_async: keep the process tracked until it actually exits.
        const wait = new Promise((resolve, reject) => {
            process.wait_async(null, (source, result) => {
                try {
                    source.wait_finish(result);
                    record.exited = true;
                    resolve();
                } catch (error) {
                    this._stop(record, error);
                    reject(error);
                }
            });
        });
        try {
            const results = await Promise.allSettled([read(stdout), read(stderr), wait]);
            if (record.error)
                throw record.error;
            const failure = results.find(result => result.status === 'rejected');
            if (failure)
                throw failure.reason;
            if (!process.get_if_exited())
                throw new Error(`${argv[0]} was interrupted.`);
            const status = process.get_exit_status();
            if (status === 124 || status === 137)
                throw new Error(`${argv[0]} timed out after 120 seconds.`);
            return {stdout: results[0].value, stderr: results[1].value, status};
        } finally {
            if (record.timer)
                GLib.Source.remove(record.timer);
            record.timer = 0;
            await Promise.allSettled([closeStream(stdout), closeStream(stderr)]);
            this._processes.delete(record);
        }
    }

    destroy() {
        this._stopped = true;
        for (const record of this._processes)
            this._stop(record, new Error('Command cancelled.'));
    }
}
