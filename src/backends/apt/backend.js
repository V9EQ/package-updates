// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Monitor} from '../../monitor.js';

export class AptBackend {
    constructor(runner) {
        this._runner = runner;
        this.updatesTitle = 'APT updates';
    }

    async getUpdates() {
        // Ask APT for its configured package indexes, not hard-coded cache paths.
        const indexes = await this._runner.run([
            'apt-get', 'indextargets', '--format', '$(FILENAME)', 'Identifier: Packages',
        ]);
        if (indexes.status !== 0)
            throw new Error(indexes.stderr.trim() || 'Could not read APT index targets.');
        if (!indexes.stdout.split('\n').some(path =>
            path.trim() && GLib.file_test(path.trim(), GLib.FileTest.IS_REGULAR)))
            throw new Error('APT package indexes are unavailable. Refresh them with sudo apt update.');

        // Simulation is read-only. Never run apt update/upgrade with privileges.
        const {stdout, stderr, status} = await this._runner.run([
            'apt-get', '--simulate', '-o', 'Debug::NoLocking=true',
            '-o', 'APT::Color=0', 'upgrade',
        ]);
        if (status !== 0)
            throw new Error(stderr.trim() || `APT simulation failed (exit ${status}).`);
        const packages = new Map();
        for (const line of stdout.split('\n')) {
            if (!line.startsWith('Inst '))
                continue;
            const match = /^Inst (\S+) \[([^\]]+)\] \((\S+)/.exec(line);
            // New dependencies have no installed-version field; do not count them.
            if (!match) {
                if (/^Inst \S+ \(/.test(line))
                    continue;
                throw new Error('Unsupported APT simulation package format.');
            }
            const [, name, installed, candidate] = match;
            if ([name, installed, candidate].some(value => value.length > 256 || !/^[!-~]+$/.test(value)))
                throw new Error('APT returned invalid package data.');
            packages.set(name, {name, detail: `${name} ${installed} → ${candidate}`});
        }
        const summary = /^(\d+) upgraded, \d+ newly installed, \d+ to remove and \d+ not upgraded\./m.exec(stdout);
        if (!summary || Number(summary[1]) !== packages.size)
            throw new Error('APT simulation summary does not match parsed upgrades.');
        return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    async watchChanges(onChanged) {
        return new Monitor('/var/lib/dpkg', onChanged, name => name === 'status');
    }

    destroy() {}
}
