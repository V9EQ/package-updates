// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ISSUES_URL} from './services.js';

const PREVIEW_LIMIT = 15;

export const UpdatesIndicator = GObject.registerClass(
class UpdatesIndicator extends PanelMenu.Button {
    _init(extension, refresh) {
        super._init(0.5, 'Arch Updates');
        this._extension = extension;
        this.menu.actor.add_style_class_name('arch-updates-menu');

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'arch-updates-counters',
        });
        this._updatesLabel = this._addCounter(box, 'updates');
        this._outdatedLabel = this._addCounter(box, 'outdated');
        this.add_child(box);

        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Arch Updates', {
            reactive: false,
            style_class: 'arch-updates-heading',
        }));
        this._updates = this._addSection('Available pacman updates');
        this._outdated = this._addSection('Out-of-date in Arch repositories');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._refreshItem = this.menu.addAction('Refresh now', refresh, 'view-refresh-symbolic');
        this.menu.addAction('View all out-of-date reports', () => this._openUri(ISSUES_URL),
            'web-browser-symbolic');
        this.menu.addAction('Preferences', () => extension.openPreferences(),
            'preferences-system-symbolic');
    }

    _addCounter(box, name) {
        const group = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'arch-updates-counter',
        });
        group.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._extension.path}/icons/${name}-symbolic.svg`),
            style_class: 'system-status-icon',
        }));
        const label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'arch-updates-count',
        });
        group.add_child(label);
        box.add_child(group);
        return label;
    }

    _addSection(title) {
        const summary = new PopupMenu.PopupMenuItem(title, {reactive: false});
        const status = new PopupMenu.PopupMenuItem('Not checked yet', {reactive: false});
        status.label.add_style_class_name('arch-updates-status');
        status.label.clutter_text.line_wrap = true;
        status.label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        const preview = new PopupMenu.PopupSubMenuMenuItem('Package details');
        this.menu.addMenuItem(summary);
        this.menu.addMenuItem(status);
        this.menu.addMenuItem(preview);
        return {title, summary, status, preview};
    }

    _openUri(uri) {
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1),
            null, (source, result) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(result);
                } catch (error) {
                    console.error(`Arch Updates: could not open link: ${error.message}`);
                }
            });
    }

    _renderSection(widgets, state, refreshing) {
        const count = state.items === null ? '—' : `${state.items.length}`;
        widgets.summary.label.text = `${widgets.title}: ${count}`;
        widgets.status.remove_style_class_name('arch-updates-error');
        if (state.error) {
            const prefix = state.items === null ? 'Unavailable' : 'Stale data';
            widgets.status.label.text = `${prefix}: ${state.error}`;
            widgets.status.add_style_class_name('arch-updates-error');
        } else if (state.updated) {
            widgets.status.label.text = `Last checked: ${state.updated.toLocaleTimeString('en-GB')}`;
        } else {
            widgets.status.label.text = refreshing ? 'Checking…' : 'Not checked yet';
        }
        widgets.preview.menu.removeAll();
        const items = state.items ?? [];
        widgets.preview.visible = items.length > 0;
        for (const item of items.slice(0, PREVIEW_LIMIT)) {
            const row = new PopupMenu.PopupMenuItem(item.detail, {reactive: Boolean(item.url)});
            row.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            if (item.url)
                row.connect('activate', () => this._openUri(item.url));
            widgets.preview.menu.addMenuItem(row);
        }
        if (items.length > PREVIEW_LIMIT) {
            widgets.preview.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                `${items.length - PREVIEW_LIMIT} more packages (preview limited to ${PREVIEW_LIMIT})`,
                {reactive: false}));
        }
    }

    render(updates, outdated, refreshing) {
        const label = state => {
            if (state.items === null)
                return state.error ? '!' : '…';
            return `${state.items.length}${state.error ? '*' : ''}`;
        };
        this._updatesLabel.text = label(updates);
        this._outdatedLabel.text = label(outdated);
        this._renderSection(this._updates, updates, refreshing);
        this._renderSection(this._outdated, outdated, refreshing);
        this._refreshItem.setSensitive(!refreshing);
        this._refreshItem.label.text = refreshing ? 'Checking…' : 'Refresh now';
        this.accessible_name = `Arch Updates: ${this._updates.summary.label.text}; ${this._outdated.summary.label.text}`;
    }
});
