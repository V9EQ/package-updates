// SPDX-License-Identifier: GPL-2.0-or-later
import {QueryScope} from '../../query.js';

const ENVIRONMENT = {FLATPAK_FANCY_OUTPUT: '0', G_MESSAGES_DEBUG: ''};

export class FlatpakService {
    constructor() {
        this._query = null;
        this._destroyed = false;
    }

    cancel() {
        this._query?.destroy();
        this._query = null;
    }

    destroy() {
        this._destroyed = true;
        this.cancel();
    }

    async getPackages() {
        if (this._destroyed || this._query)
            throw new Error('Flatpak service is stopped or already checking.');
        const query = new QueryScope('Flatpak');
        this._query = query;
        try {
            return await this._getPackages(query);
        } catch (error) {
            query.checkActive();
            throw error;
        } finally {
            query.destroy();
            if (this._query === query)
                this._query = null;
        }
    }

    async _getPackages(query) {
        const run = async argv => {
            query.checkActive();
            const {stdout, stderr, status} = await query.runner.run(['flatpak', ...argv], ENVIRONMENT);
            query.checkActive();
            // Flatpak can warn about unreadable deployments while returning 0.
            if (status !== 0 || stderr.trim())
                throw new Error(stderr.trim() || `Flatpak failed (exit ${status}).`);
            return stdout.trim() ? stdout.trim().split('\n') : [];
        };
        // Lists all configured installations with deployed refs, not just the default one.
        const installations = new Set(await run(['list', '--all', '--columns=installation']));
        const packages = new Map();
        for (const installation of installations) {
            if (installation.length > 255 || !/^[!-~]+$/.test(installation))
                throw new Error('Flatpak returned an invalid installation identifier.');
            const scope = installation === 'user' ? '--user'
                : installation === 'system' ? '--system' : `--installation=${installation}`;
            const rows = await run([
                scope, 'remote-ls', '--updates', '--all', '--arch=*', '--columns=ref,origin',
            ]);
            for (const row of rows) {
                if (row.length > 2048)
                    throw new Error('Flatpak returned an oversized update row.');
                const fields = row.split('\t');
                const match = /^(app|runtime)\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_.-]+)$/.exec(fields[0]);
                if (fields.length !== 2 || !match || !/^[!-~]{1,255}$/.test(fields[1]))
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
        query.checkActive();
        return [...packages.values()].sort((a, b) =>
            a.name.localeCompare(b.name) || a.detail.localeCompare(b.detail));
    }
}
