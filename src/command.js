// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class CommandRunner {
    constructor() {
        this._cancellable = new Gio.Cancellable();
        this._processes = new Set();
    }

    async run(argv, environment = {}) {
        if (this._cancellable.is_cancelled())
            throw new Gio.IOErrorEnum({code: Gio.IOErrorEnum.CANCELLED, message: 'Command runner stopped.'});
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
        for (const [name, value] of Object.entries(environment))
            launcher.setenv(name, value, true);
        const process = launcher.spawnv([
            timeout, '--kill-after=5s', '120s', program, ...argv.slice(1),
        ]);
        this._processes.add(process);
        try {
            const [stdout, stderr] = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, this._cancellable, (source, result) => {
                    try {
                        const [, out, err] = source.communicate_utf8_finish(result);
                        resolve([out, err]);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (!process.get_if_exited())
                throw new Error(`${argv[0]} was interrupted.`);
            const status = process.get_exit_status();
            if (status === 124 || status === 137)
                throw new Error(`${argv[0]} timed out after 120 seconds.`);
            return {stdout, stderr, status};
        } finally {
            this._processes.delete(process);
        }
    }

    destroy() {
        // GNU timeout forwards TERM to the entire command process group.
        for (const process of this._processes)
            process.send_signal(15);
        this._processes.clear();
        this._cancellable.cancel();
    }
}
