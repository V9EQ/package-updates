// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Monitor} from '../../monitor.js';

export class FedoraBackend {
    constructor(runner) {
        this._runner = runner;
        this.updatesTitle = 'DNF updates';
    }

    async getUpdates({local = false} = {}) {
        if (!GLib.find_program_in_path('dnf5'))
            throw new Error('DNF5 with check-upgrade --json support is required.');
        const argv = ['dnf5', '--quiet', '--assumeno', '--color=never', '--setopt=*.skip_if_unavailable=False'];
        if (local)
            argv.push('--cacheonly');
        argv.push('check-upgrade', '--json');
        const {stdout, stderr, status} = await this._runner.run(argv);
        // DNF documents 100 for available updates; JSON implementations can
        // return 0 before the text-output exit-code path. Parse JSON in both cases.
        if (status !== 0 && status !== 100)
            throw new Error(stderr.trim() || `DNF5 check failed (exit ${status}).`);
        const sections = JSON.parse(stdout);
        if (!sections || typeof sections !== 'object' || Array.isArray(sections))
            throw new Error('Invalid DNF5 JSON response.');
        const packages = new Map();
        for (const rows of Object.values(sections)) {
            if (!Array.isArray(rows))
                throw new Error('Invalid DNF5 JSON section.');
            for (const row of rows) {
                if (!row || typeof row.name !== 'string' || !row.name ||
                    typeof row.arch !== 'string' || !row.arch ||
                    typeof row.evr !== 'string' || !row.evr)
                    throw new Error('Invalid DNF5 package record.');
                const name = `${row.name}.${row.arch}`;
                // The same candidate can appear in upgrades and obsoletes.
                packages.set(name, {name, detail: `${name} → ${row.evr}`});
            }
        }
        if (status === 100 && packages.size === 0)
            throw new Error('DNF5 reported updates but returned no packages.');
        return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    async watchChanges(onChanged) {
        const {stdout, stderr, status} = await this._runner.run(['rpm', '--eval', '%{_dbpath}']);
        const path = stdout.trim();
        if (status !== 0 || !GLib.path_is_absolute(path))
            throw new Error(stderr.trim() || 'Could not determine the RPM database path.');
        return new Monitor(path, onChanged,
            name => name === 'rpmdb.sqlite' || name === 'rpmdb.sqlite-wal');
    }

    destroy() {}
}
