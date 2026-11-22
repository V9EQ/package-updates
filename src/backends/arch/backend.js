// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Monitor} from './monitor.js';
import {AurService} from './aur.js';

export class ArchBackend {
    constructor(runner) {
        this._runner = runner;
        this._cacheDatabase = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'package-updates', 'checkupdates',
        ]);
        this.updatesTitle = 'Pacman updates';
        this.aur = new AurService();
    }

    async getUpdates({local = false} = {}) {
        if (local) {
            // Read the same repository metadata that produced the displayed
            // count, not pacman's potentially stale system sync database.
            for (const directory of ['local', 'sync']) {
                if (!GLib.file_test(GLib.build_filenamev([this._cacheDatabase, directory]), GLib.FileTest.IS_DIR))
                    throw new Error('checkupdates database is not cached; refresh now.');
            }
            const {stdout, stderr, status} = await this._runner.run([
                'pacman', '--color', 'never', '-Qu', '--dbpath', this._cacheDatabase,
            ]);
            if (status === 1 && !stdout.trim() && !stderr.trim())
                return [];
            if (status !== 0 || stderr.trim())
                throw new Error(stderr.trim() || `pacman failed (exit ${status}).`);
            return this._parse(stdout);
        }
        if (!GLib.find_program_in_path('checkupdates'))
            throw new Error('Install pacman-contrib to provide checkupdates.');
        const {stdout, stderr, status} = await this._runner.run(
            ['checkupdates', '--nocolor'], {CHECKUPDATES_DB: this._cacheDatabase});
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

    async _getPath(directive) {
        const {stdout, stderr, status} = await this._runner.run(['pacman-conf', directive]);
        const path = stdout.trim();
        if (status !== 0 || stderr.trim() || path.includes('\n') || !GLib.path_is_absolute(path))
            throw new Error(stderr.trim() || `Could not determine pacman ${directive}.`);
        return path;
    }

    async watchChanges(onChanged) {
        const [database, log] = await Promise.all([this._getPath('DBPath'), this._getPath('LogFile')]);
        return new Monitor(database, log, onChanged);
    }

    destroy() {
        this.aur.destroy();
    }
}
