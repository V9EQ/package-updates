// SPDX-License-Identifier: GPL-2.0-or-later
import {QueryScope} from '../../query.js';

const API_URL = 'https://aur.archlinux.org/rpc/v5/info';
const MAX_URL_LENGTH = 4000;
const MAX_BATCH_SIZE = 100;
const validVersion = value => typeof value === 'string' && value.length <= 256 && /^[!-~]+$/.test(value);

export class AurService {
    constructor() {
        this._query = null;
        this._destroyed = false;
        // Includes null entries for names absent from AUR. Never persisted.
        this._versions = new Map();
    }

    cancel() {
        this._query?.destroy();
        this._query = null;
    }

    destroy() {
        this._destroyed = true;
        this.cancel();
        this._versions.clear();
    }

    async _getVersions(names, query) {
        const url = `${API_URL}?${names.map(name => `arg%5B%5D=${encodeURIComponent(name)}`).join('&')}`;
        const data = await query.getJson(url);
        if (data?.version !== 5 || data.type !== 'multiinfo' || !Array.isArray(data.results) ||
            data.resultcount !== data.results.length || data.results.length > names.length)
            throw new Error('AUR returned an invalid package response.');
        const versions = new Map(names.map(name => [name, null]));
        for (const item of data.results) {
            if (!item || !versions.has(item.Name) || versions.get(item.Name) !== null || !validVersion(item.Version))
                throw new Error('AUR returned invalid or duplicate package data.');
            versions.set(item.Name, item.Version);
        }
        return versions;
    }

    _batches(names) {
        const batches = [];
        let batch = [];
        let length = API_URL.length;
        for (const name of names) {
            const argumentLength = `&arg%5B%5D=${encodeURIComponent(name)}`.length;
            if (API_URL.length + argumentLength > MAX_URL_LENGTH)
                throw new Error('Package name exceeds the AUR request length limit.');
            if (batch.length >= MAX_BATCH_SIZE || length + argumentLength > MAX_URL_LENGTH) {
                batches.push(batch);
                batch = [];
                length = API_URL.length;
            }
            batch.push(name);
            length += argumentLength;
        }
        if (batch.length)
            batches.push(batch);
        return batches;
    }

    async getPackages({local = false} = {}) {
        if (this._destroyed || this._query)
            throw new Error('AUR service is stopped or already checking.');
        const query = new QueryScope('AUR');
        this._query = query;
        try {
            return await this._getPackages(query, local);
        } catch (error) {
            query.checkActive();
            throw error;
        } finally {
            query.destroy();
            if (this._query === query)
                this._query = null;
        }
    }

    async _getPackages(query, local) {
        const {stdout, stderr, status} = await query.runner.run(['pacman', '-Qm']);
        query.checkActive();
        if (stderr.trim() || (status !== 0 && !(status === 1 && !stdout.trim())))
            throw new Error(stderr.trim() || `pacman -Qm failed (exit ${status}).`);
        const installed = new Map();
        for (const line of stdout.trim() ? stdout.trim().split('\n') : []) {
            const match = /^([a-zA-Z0-9@_+][a-zA-Z0-9@_.+-]*) (\S+)$/.exec(line);
            if (!match || match[1].length > 255 || !validVersion(match[2]) ||
                match[2].startsWith('-') || installed.has(match[1]))
                throw new Error('pacman -Qm returned unrecognized or duplicate package data.');
            installed.set(match[1], match[2]);
        }
        let versions = this._versions;
        if (local) {
            if ([...installed.keys()].some(name => !versions.has(name)))
                throw new Error('AUR metadata is not cached for all installed packages; refresh now.');
        } else {
            versions = new Map();
            for (const batch of this._batches([...installed.keys()])) {
                query.checkActive();
                for (const [name, version] of await this._getVersions(batch, query))
                    versions.set(name, version);
            }
        }
        const packages = [];
        for (const [name, installedVersion] of installed) {
            query.checkActive();
            const version = versions.get(name);
            if (version === null || version === installedVersion)
                continue;
            const result = await query.runner.run(['vercmp', installedVersion, version]);
            if (result.status !== 0 || result.stderr.trim() || !/^-?\d+$/.test(result.stdout.trim()))
                throw new Error(result.stderr.trim() || 'vercmp returned an invalid comparison.');
            if (Number(result.stdout.trim()) < 0) {
                packages.push({
                    name,
                    detail: `${name} ${installedVersion} → ${version}`,
                    url: `https://aur.archlinux.org/packages/${encodeURIComponent(name)}`,
                });
            }
        }
        query.checkActive();
        if (!local)
            this._versions = versions;
        return packages.sort((a, b) => a.name.localeCompare(b.name));
    }
}
