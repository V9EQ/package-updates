// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {CommandRunner} from '../../command.js';

const API_URL = 'https://aur.archlinux.org/rpc/v5/info';
const MAX_URL_LENGTH = 4000;
const MAX_BATCH_SIZE = 100;

export class AurService {
    constructor() {
        this._runner = new CommandRunner();
        this._cancellable = new Gio.Cancellable();
        this._session = null;
        // Includes null entries for names absent from AUR. Never persisted.
        this._versions = new Map();
    }

    cancel() {
        this._runner.destroy();
        this._cancellable.cancel();
        this._session?.abort();
        this._runner = new CommandRunner();
        this._cancellable = new Gio.Cancellable();
        this._session = null;
    }

    destroy() {
        this._runner.destroy();
        this._cancellable.cancel();
        this._session?.abort();
        this._session = null;
        this._versions.clear();
    }

    async _getVersions(names, session, cancellable) {
        const url = `${API_URL}?${names.map(name => `arg%5B%5D=${encodeURIComponent(name)}`).join('&')}`;
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('Accept', 'application/json');
        const bytes = await new Promise((resolve, reject) => {
            session.send_and_read_async(message, GLib.PRIORITY_DEFAULT,
                cancellable, (source, result) => {
                    try {
                        resolve(source.send_and_read_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
        });
        if (message.status_code === 429)
            throw new Error('AUR rate limit reached. Try again later.');
        if (message.status_code !== 200)
            throw new Error(`AUR returned HTTP ${message.status_code}.`);
        if (!message.response_headers.get_content_type()?.[0]?.includes('json'))
            throw new Error('AUR returned a non-JSON response (possibly bot protection).');
        const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        if (data?.version !== 5 || data.type !== 'multiinfo' || !Array.isArray(data.results) ||
            data.resultcount !== data.results.length)
            throw new Error('AUR returned an invalid package response.');
        const versions = new Map(names.map(name => [name, null]));
        for (const item of data.results) {
            if (!item || !versions.has(item.Name) || versions.get(item.Name) !== null ||
                typeof item.Version !== 'string' || !/^[^\s\x00-\x1f\x7f]+$/.test(item.Version))
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
        // Capture resources so a cancelled query cannot use a replacement runner/session.
        const runner = this._runner;
        const cancellable = this._cancellable;
        const deadline = GLib.get_monotonic_time() + 120 * GLib.USEC_PER_SEC;
        const checkActive = () => {
            if (cancellable.is_cancelled())
                throw new Error('AUR check cancelled.');
            if (GLib.get_monotonic_time() > deadline)
                throw new Error('AUR check timed out; refusing a partial count.');
        };
        checkActive();
        const {stdout, stderr, status} = await runner.run(['pacman', '-Qm']);
        checkActive();
        if (status !== 0 && !(status === 1 && !stdout.trim() && !stderr.trim()))
            throw new Error(stderr.trim() || `pacman -Qm failed (exit ${status}).`);
        const installed = new Map();
        for (const line of stdout.trim() ? stdout.trim().split('\n') : []) {
            const match = /^([a-zA-Z0-9@_+][a-zA-Z0-9@_.+-]*) ([^\s\x00-\x1f\x7f]+)$/.exec(line);
            if (!match || installed.has(match[1]))
                throw new Error('pacman -Qm returned unrecognized or duplicate package data.');
            installed.set(match[1], match[2]);
        }
        let versions = this._versions;
        if (local) {
            if ([...installed.keys()].some(name => !versions.has(name)))
                throw new Error('AUR metadata is not cached for all installed packages; refresh now.');
        } else {
            versions = new Map();
            if (installed.size) {
                if (!this._session) {
                    this._session = new Soup.Session({
                        user_agent: 'PackageUpdates/2.0 (GNOME Shell extension)',
                        timeout: 30,
                        idle_timeout: 15,
                    });
                }
                const session = this._session;
                for (const batch of this._batches([...installed.keys()])) {
                    checkActive();
                    for (const [name, version] of await this._getVersions(batch, session, cancellable))
                        versions.set(name, version);
                }
            }
        }
        const packages = [];
        for (const [name, installedVersion] of installed) {
            checkActive();
            const version = versions.get(name);
            if (version === null || version === installedVersion)
                continue;
            const result = await runner.run(['vercmp', installedVersion, version]);
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
        checkActive();
        // Publish metadata only after the whole query and all comparisons succeed.
        if (!local)
            this._versions = versions;
        return packages.sort((a, b) => a.name.localeCompare(b.name));
    }
}
