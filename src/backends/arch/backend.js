// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Monitor} from './monitor.js';
import {AurService} from './aur.js';

export class ArchBackend {
    constructor(runner) {
        this._runner = runner;
        this.updatesTitle = 'Pacman updates';
        this.aur = new AurService();
    }

    async getUpdates({local = false} = {}) {
        if (local) {
            const {stdout, stderr, status} = await this._runner.run(['pacman', '--color', 'never', '-Qu']);
            if (status === 1 && !stdout.trim() && !stderr.trim())
                return [];
            if (status !== 0 || stderr.trim())
                throw new Error(stderr.trim() || `pacman failed (exit ${status}).`);
            return this._parse(stdout);
        }
        if (!GLib.find_program_in_path('checkupdates'))
            throw new Error('Install pacman-contrib to provide checkupdates.');
        const database = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'package-updates', 'checkupdates',
        ]);
        const {stdout, stderr, status} = await this._runner.run(
            ['checkupdates', '--nocolor'], {CHECKUPDATES_DB: database});
        if (status === 2 && !stdout.trim() && !stderr.trim())
            return [];
        if (status !== 0 || stderr.trim())
            throw new Error(stderr.trim() || `checkupdates failed (exit ${status}).`);
        return this._parse(stdout);
    }

    _parse(stdout) {
        const packages = new Map();
        for (const line of stdout.split('\n').filter(Boolean)) {
            const match = /^([a-zA-Z0-9@_+][a-zA-Z0-9@_.+-]*) ([!-~]+) -> ([!-~]+)( \[ignored\])?$/.exec(line);
            if (!match || match[1].length > 255 || match[2].length > 256 || match[3].length > 256 ||
                packages.has(match[1]))
                throw new Error('pacman returned unrecognized or duplicate update data.');
            if (!match[4])
                packages.set(match[1], {name: match[1], detail: line});
        }
        return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
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
        this.aur.destroy();
    }
}
