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
        this._showOutdated = this._service.supportsOutdated && this._settings.get_boolean('show-outdated');
        this._updates = {
            items: null,
            error: this._service.supported ? null : this._service.system.reason,
            updated: null,
            busy: false,
        };
        if (!this._service.supported)
            console.warn(`${this.metadata.name}: ${this._updates.error}`);
        this._outdated = {items: null, error: null, updated: null, busy: false};
        this._pendingUpdatesRefresh = false;
        this._settingsSignals = [
            this._settings.connect('changed::panel-position', () => this._placeIndicator()),
            this._settings.connect('changed::refresh-interval', () => this._startTimer()),
            this._settings.connect('changed::show-outdated', () => this._onOutdatedChanged()),
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
            const monitor = await service.watchChanges(() => this._refreshSource('updates', true));
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

    _onOutdatedChanged() {
        const showOutdated = this._service.supportsOutdated && this._settings.get_boolean('show-outdated');
        if (showOutdated === this._showOutdated)
            return;
        this._showOutdated = showOutdated;
        this._service.cancelOutdated();
        // Replacing the state invalidates any late result from a cancelled scan.
        this._outdated = {items: null, error: null, updated: null, busy: false};
        this._placeIndicator();
        if (this._showOutdated)
            this._refreshSource('outdated');
    }

    _placeIndicator() {
        this._indicator?.destroy();
        this._indicator = new UpdatesIndicator(this, () => this._refresh(), {
            showOutdated: this._showOutdated,
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
        this._indicator?.render(this._updates, this._outdated,
            this._updates.busy || (this._showOutdated && this._outdated.busy));
    }

    _refresh() {
        if (!this._service?.supported)
            return;
        this._refreshSource('updates');
        if (this._showOutdated)
            this._refreshSource('outdated');
    }

    async _refreshSource(source, local = false) {
        if (!this._service?.supported || (source === 'outdated' && !this._showOutdated))
            return;
        const service = this._service;
        const state = source === 'updates' ? this._updates : this._outdated;
        const isCurrent = () => this._service === service &&
            state === (source === 'updates' ? this._updates : this._outdated);
        if (state.busy) {
            // Database changes during a running query require another read so
            // an older result cannot remain visible after packages change.
            if (local)
                this._pendingUpdatesRefresh = true;
            return;
        }
        state.busy = true;
        this._render();
        try {
            const items = await (source === 'outdated'
                ? service.getOutdated()
                : local ? service.getLocalUpdates() : service.getUpdates());
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
                if (source === 'updates' && this._pendingUpdatesRefresh) {
                    this._pendingUpdatesRefresh = false;
                    this._refreshSource('updates', true);
                }
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
        this._outdated = null;
        this._showOutdated = false;
        this._pendingUpdatesRefresh = false;
    }
}
