// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {CommandRunner} from '../../command.js';

const ENVIRONMENT = {FLATPAK_FANCY_OUTPUT: '0', G_MESSAGES_DEBUG: ''};

export class FlatpakService {
    constructor() {
        this._runner = new CommandRunner();
        this._destroyed = false;
    }

    cancel() {
        this._runner.destroy();
        this._runner = new CommandRunner();
    }

    destroy() {
        this._destroyed = true;
        this._runner.destroy();
    }

    async getPackages() {
        const runner = this._runner;
        const deadline = GLib.get_monotonic_time() + 120 * GLib.USEC_PER_SEC;
        const run = async argv => {
            if (this._destroyed || runner !== this._runner)
                throw new Error('Flatpak check cancelled.');
            if (GLib.get_monotonic_time() > deadline)
                throw new Error('Flatpak check timed out; refusing a partial count.');
            const {stdout, stderr, status} = await runner.run(['flatpak', ...argv], ENVIRONMENT);
            if (this._destroyed || runner !== this._runner)
                throw new Error('Flatpak check cancelled.');
            if (GLib.get_monotonic_time() > deadline)
                throw new Error('Flatpak check timed out; refusing a partial count.');
            // Flatpak can warn about unreadable deployments while returning 0.
            if (status !== 0 || stderr.trim())
                throw new Error(stderr.trim() || `Flatpak failed (exit ${status}).`);
            return stdout.trim() ? stdout.trim().split('\n') : [];
        };
        // Lists all configured installations with deployed refs, not just the default one.
        const installations = new Set(await run(['list', '--all', '--columns=installation']));
        const packages = new Map();
        for (const installation of installations) {
            if (!/^[^\s\x00-\x1f\x7f]+$/.test(installation))
                throw new Error('Flatpak returned an invalid installation identifier.');
            const scope = installation === 'user' ? '--user'
                : installation === 'system' ? '--system' : `--installation=${installation}`;
            const rows = await run([
                scope, 'remote-ls', '--updates', '--all', '--arch=*', '--columns=ref,origin',
            ]);
            for (const row of rows) {
                const fields = row.split('\t');
                const match = /^(app|runtime)\/([^/\s\x00-\x1f\x7f]+)\/([^/\s\x00-\x1f\x7f]+)\/([^/\s\x00-\x1f\x7f]+)$/.exec(fields[0]);
                if (fields.length !== 2 || !match || !/^[^\s\x00-\x1f\x7f]+$/.test(fields[1]))
                    throw new Error('Flatpak returned an unrecognized update row.');
                const [, kind, name, arch, branch] = match;
                const key = `${installation}/${fields[0]}`;
                if (packages.has(key))
                    throw new Error('Flatpak returned a duplicate update.');
                packages.set(key, {
                    name,
                    detail: `${name} · ${kind} · ${arch}/${branch} · ${installation} · ${fields[1]}`,
                });
            }
        }
        return [...packages.values()].sort((a, b) =>
            a.name.localeCompare(b.name) || a.detail.localeCompare(b.detail));
    }
}
