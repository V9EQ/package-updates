// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {UpdatesIndicator} from './indicator.js';
import {PackageService} from './services.js';

export default class ArchUpdatesExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._service = new PackageService();
        this._updates = {items: null, error: null, updated: null};
        this._outdated = {items: null, error: null, updated: null};
        this._refreshing = false;
        this._settingsSignals = [
            this._settings.connect('changed::panel-position', () => this._placeIndicator()),
            this._settings.connect('changed::refresh-interval', () => this._startTimer()),
        ];
        this._placeIndicator();
        this._startTimer();
        this._refresh();
    }

    _placeIndicator() {
        this._indicator?.destroy();
        this._indicator = new UpdatesIndicator(this, () => this._refresh());
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
        this._indicator?.render(this._updates, this._outdated, this._refreshing);
    }

    async _refresh() {
        if (!this._service || this._refreshing)
            return;
        const service = this._service;
        this._refreshing = true;
        this._render();

        const load = async (state, getter) => {
            try {
                const items = await getter();
                // A previous enable/disable cycle must not update a new indicator.
                if (this._service !== service)
                    return;
                state.items = items;
                state.error = null;
                state.updated = new Date();
            } catch (error) {
                if (this._service !== service)
                    return;
                // Keep the last successful result, clearly marked as stale.
                state.error = error.message;
            }
            if (this._service === service)
                this._render();
        };
        try {
            await Promise.all([
                load(this._updates, () => service.getUpdates()),
                load(this._outdated, () => service.getOutdated()),
            ]);
        } finally {
            if (this._service === service) {
                this._refreshing = false;
                this._render();
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
        const service = this._service;
        this._service = null;
        service?.destroy();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
        this._updates = null;
        this._outdated = null;
        this._refreshing = false;
    }
}
