// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {UpdatesIndicator} from './indicator.js';
import {PackageService} from './services.js';

export default class PackageUpdatesExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._service = new PackageService();
        this._showAur = this._service.supportsAur && this._settings.get_boolean('show-aur');
        this._showFlatpak = this._service.supportsFlatpak && this._settings.get_boolean('show-flatpak');
        this._updates = {
            items: null,
            error: this._service.supported ? null : this._service.system.reason,
            updated: null,
            busy: false,
        };
        if (!this._service.supported)
            console.warn(`${this.metadata.name}: ${this._updates.error}`);
        this._aur = {items: null, error: null, updated: null, busy: false};
        this._flatpak = {items: null, error: null, updated: null, busy: false};
        this._pendingLocalRefresh = new Set();
        this._settingsSignals = [
            this._settings.connect('changed::panel-position', () => this._placeIndicator()),
            this._settings.connect('changed::refresh-interval', () => this._startTimer()),
            this._settings.connect('changed::show-aur', () => this._onAurChanged()),
            this._settings.connect('changed::show-flatpak', () => this._onFlatpakChanged()),
        ];
        this._placeIndicator();
        this._startTimer();
        this._watchPackageChanges();
        this._refresh();
    }

    async _watchPackageChanges() {
        const service = this._service;
        if (!service.supported)
            return;
        try {
            const monitor = await service.watchChanges(() => {
                this._refreshSource('updates', true);
                if (this._showAur)
                    this._refreshSource('aur', true);
            });
            if (this._service !== service) {
                monitor.destroy();
                return;
            }
            this._monitor = monitor;
        } catch (error) {
            if (this._service === service)
                console.warn(`${this.metadata.name}: database monitoring unavailable: ${error.message}`);
        }
    }

    _onAurChanged() {
        const showAur = this._service.supportsAur && this._settings.get_boolean('show-aur');
        if (showAur === this._showAur)
            return;
        this._showAur = showAur;
        this._service.cancelAur();
        this._pendingLocalRefresh.delete('aur');
        // Invalidate late command/HTTP results from the previous setting.
        this._aur = {items: null, error: null, updated: null, busy: false};
        this._placeIndicator();
        if (this._showAur)
            this._refreshSource('aur');
    }

    _onFlatpakChanged() {
        const showFlatpak = this._service.supportsFlatpak && this._settings.get_boolean('show-flatpak');
        if (showFlatpak === this._showFlatpak)
            return;
        this._showFlatpak = showFlatpak;
        this._service.cancelFlatpak();
        this._flatpak = {items: null, error: null, updated: null, busy: false};
        this._placeIndicator();
        if (this._showFlatpak)
            this._refreshSource('flatpak');
    }

    _placeIndicator() {
        this._indicator?.destroy();
        this._indicator = new UpdatesIndicator(this, () => this._refresh(), {
            showAur: this._showAur,
            showFlatpak: this._showFlatpak,
            updatesTitle: this._service.updatesTitle,
            supported: this._service.supported,
        });
        const position = this._settings.get_string('panel-position');
        Main.panel.addToStatusArea(this.uuid, this._indicator,
            position === 'right' ? 0 : -1, position);
        this._render();
    }

    _startTimer() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('refresh-interval') * 60, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _render() {
        this._indicator?.render({
            updates: this._updates, aur: this._aur, flatpak: this._flatpak,
        }, this._updates.busy || (this._showAur && this._aur.busy) ||
            (this._showFlatpak && this._flatpak.busy));
    }

    _refresh() {
        if (!this._service)
            return;
        if (this._service.supported)
            this._refreshSource('updates');
        if (this._showFlatpak)
            this._refreshSource('flatpak');
        if (this._showAur)
            this._refreshSource('aur');
    }

    async _refreshSource(source, local = false) {
        if (!this._service || (source === 'flatpak' ? !this._showFlatpak : !this._service.supported) ||
            (source === 'aur' && !this._showAur))
            return;
        const service = this._service;
        const state = this[`_${source}`];
        const isCurrent = () => this._service === service && state === this[`_${source}`];
        if (state.busy) {
            // Database changes during a running query require another read so
            // an older result cannot remain visible after packages change.
            if (local)
                this._pendingLocalRefresh.add(source);
            return;
        }
        state.busy = true;
        this._render();
        try {
            let items;
            if (source === 'aur')
                items = await service.getAurUpdates({local});
            else if (source === 'flatpak')
                items = await service.getFlatpakUpdates();
            else
                items = await (local ? service.getLocalUpdates() : service.getUpdates());
            // Ignore results from a previous enable cycle or feature setting.
            if (!isCurrent())
                return;
            state.items = items;
            state.error = null;
            state.updated = new Date();
        } catch (error) {
            if (!isCurrent())
                return;
            // Keep technical details out of the menu. Log each distinct failure
            // once per source until a successful check clears the error.
            const detail = error?.message || String(error);
            if (state.error !== detail)
                console.warn(`${this.metadata.name}: ${source} sync failed: ${detail}`);
            // Keep the last successful result, clearly marked as stale.
            state.error = detail;
        } finally {
            if (isCurrent()) {
                state.busy = false;
                this._render();
                if (this._pendingLocalRefresh.delete(source))
                    this._refreshSource(source, true);
            }
        }
    }

    // GNOME Shell 51 explicitly requires a synchronous disable().
    disable() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        for (const id of this._settingsSignals ?? [])
            this._settings.disconnect(id);
        this._settingsSignals = null;
        this._monitor?.destroy();
        this._monitor = null;
        const service = this._service;
        this._service = null;
        service?.destroy();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
        this._updates = null;
        this._aur = null;
        this._flatpak = null;
        this._showAur = false;
        this._showFlatpak = false;
        this._pendingLocalRefresh = null;
    }
}
