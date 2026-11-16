// SPDX-License-Identifier: GPL-2.0-or-later
import {CommandRunner} from './command.js';
import {detectSystem} from './platform.js';
import {ArchBackend} from './backends/arch/backend.js';

export {ISSUES_URL} from './backends/arch/outdated.js';

export class PackageService {
    constructor() {
        this.system = detectSystem();
        this._runner = new CommandRunner();
        this._backend = this.system.backendId === 'arch' ? new ArchBackend(this._runner) : null;
    }

    get supportsOutdated() {
        return Boolean(this._backend?.outdated);
    }

    get updatesTitle() {
        return this._backend?.updatesTitle || 'Package updates';
    }

    _requireBackend() {
        if (!this._backend)
            throw new Error(this.system.reason || `Backend unavailable: ${this.system.name}`);
        return this._backend;
    }

    getUpdates() {
        return this._requireBackend().getUpdates();
    }

    getLocalUpdates() {
        return this._requireBackend().getUpdates({local: true});
    }

    getDatabasePath() {
        return this._requireBackend().getDatabasePath();
    }

    watchChanges(onChanged) {
        return this._requireBackend().watchChanges(onChanged);
    }

    getOutdated() {
        const backend = this._requireBackend();
        if (!backend.outdated)
            throw new Error('Out-of-date reports are only available on Arch Linux.');
        return backend.outdated.getPackages();
    }

    cancelOutdated() {
        this._backend?.outdated?.cancel();
    }

    destroy() {
        this._backend?.destroy();
        this._runner.destroy();
    }
}
