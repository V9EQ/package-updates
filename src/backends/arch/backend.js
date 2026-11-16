// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Monitor} from './monitor.js';
import {OutdatedService} from './outdated.js';

export class ArchBackend {
    constructor(runner) {
        this._runner = runner;
        this.updatesTitle = 'Pacman updates';
        this.outdated = new OutdatedService();
    }

    async getUpdates({local = false} = {}) {
        if (local) {
            const {stdout, stderr, status} = await this._runner.run(['pacman', '-Qu']);
            if (status === 1 && !stdout.trim() && !stderr.trim())
                return [];
            if (status !== 0)
                throw new Error(stderr.trim() || `pacman failed (exit ${status}).`);
            return this._parse(stdout);
        }
        if (!GLib.find_program_in_path('checkupdates'))
            throw new Error('Install pacman-contrib to provide checkupdates.');
        const database = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'arch-updates', 'checkupdates',
        ]);
        const {stdout, stderr, status} = await this._runner.run(
            ['checkupdates', '--nocolor'], {CHECKUPDATES_DB: database});
        if (status === 2)
            return [];
        if (status !== 0)
            throw new Error(stderr.trim() || `checkupdates failed (exit ${status}).`);
        return this._parse(stdout);
    }

    _parse(stdout) {
        return stdout.split('\n').map(line => line.trim())
            .filter(line => line && !/\[.*\]/.test(line))
            .map(line => ({name: line.split(/\s+/)[0], detail: line}))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async getDatabasePath() {
        const {stdout, stderr, status} = await this._runner.run(['pacman-conf', 'DBPath']);
        const path = stdout.trim();
        if (status !== 0 || !GLib.path_is_absolute(path))
            throw new Error(stderr.trim() || 'Could not determine the pacman database path.');
        return path;
    }

    async watchChanges(onChanged) {
        return new Monitor(await this.getDatabasePath(), onChanged);
    }

    destroy() {
        this.outdated.destroy();
    }
}
