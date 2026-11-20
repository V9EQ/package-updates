// SPDX-License-Identifier: GPL-2.0-or-later
import {CommandRunner} from './command.js';
import {detectSystem, hasFlatpak} from './platform.js';
import {ArchBackend} from './backends/arch/backend.js';
import {UbuntuBackend} from './backends/ubuntu/backend.js';
import {DebianBackend} from './backends/debian/backend.js';
import {FedoraBackend} from './backends/fedora/backend.js';
import {FlatpakService} from './backends/flatpak/backend.js';

const BACKENDS = {arch: ArchBackend, ubuntu: UbuntuBackend, debian: DebianBackend, fedora: FedoraBackend};

export {ISSUES_URL} from './backends/arch/outdated.js';

export class PackageService {
    constructor() {
        this.system = detectSystem();
        this._runner = new CommandRunner();
        const Backend = BACKENDS[this.system.backendId];
        this._backend = Backend ? new Backend(this._runner) : null;
        this._flatpak = hasFlatpak() ? new FlatpakService() : null;
    }

    get supported() {
        return this._backend !== null;
    }

    get supportsOutdated() {
        return Boolean(this._backend?.outdated);
    }

    get supportsAur() {
        return Boolean(this._backend?.aur);
    }

    get supportsFlatpak() {
        return this._flatpak !== null;
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

    getAurUpdates({local = false} = {}) {
        const backend = this._requireBackend();
        if (!backend.aur)
            throw new Error('AUR updates are only available on Arch Linux.');
        return backend.aur.getPackages({local});
    }

    cancelAur() {
        this._backend?.aur?.cancel();
    }

    getFlatpakUpdates() {
        if (!this._flatpak)
            throw new Error('Flatpak is not installed.');
        return this._flatpak.getPackages();
    }

    cancelFlatpak() {
        this._flatpak?.cancel();
    }

    destroy() {
        this._flatpak?.destroy();
        this._backend?.destroy();
        this._runner.destroy();
    }
}
