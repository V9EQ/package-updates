// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {detectSystem, hasFlatpak} from './platform.js';

export default class PackageUpdatesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const supportsOutdated = detectSystem().backendId === 'arch';
        const supportsFlatpak = hasFlatpak();
        window.set_default_size(480, supportsOutdated || supportsFlatpak ? 480 : 320);
        const settings = this.getSettings();
        // Retain settings for the lifetime of the preferences window.
        window._settings = settings;
        const page = new Adw.PreferencesPage({title: 'General', icon_name: 'system-software-update-symbolic'});
        window.add(page);

        const appearance = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearance);
        const positions = ['left', 'center', 'right'];
        const position = new Adw.ComboRow({
            title: 'Top bar position',
            model: Gtk.StringList.new(['Left', 'Center', 'Right']),
            selected: positions.indexOf(settings.get_string('panel-position')),
        });
        appearance.add(position);
        position.connect('notify::selected', () => {
            settings.set_string('panel-position', positions[position.selected]);
        });
        const positionId = settings.connect('changed::panel-position', () => {
            position.selected = positions.indexOf(settings.get_string('panel-position'));
        });
        window.connect('close-request', () => {
            settings.disconnect(positionId);
            return false;
        });

        const polling = new Adw.PreferencesGroup({title: 'Updates'});
        page.add(polling);
        const interval = new Adw.SpinRow({
            title: 'Check interval (minutes)',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 1440, step_increment: 1, page_increment: 5,
            }),
            digits: 0,
        });
        polling.add(interval);
        settings.bind('refresh-interval', interval, 'value', Gio.SettingsBindFlags.DEFAULT);

        if (supportsFlatpak) {
            const flatpak = new Adw.SwitchRow({title: 'Flatpak updates'});
            polling.add(flatpak);
            settings.bind('show-flatpak', flatpak, 'active', Gio.SettingsBindFlags.DEFAULT);
        }

        if (supportsOutdated) {
            const aur = new Adw.SwitchRow({title: 'AUR updates'});
            polling.add(aur);
            settings.bind('show-aur', aur, 'active', Gio.SettingsBindFlags.DEFAULT);

            const outdated = new Adw.SwitchRow({title: 'Outdated packages'});
            polling.add(outdated);
            settings.bind('show-outdated', outdated, 'active', Gio.SettingsBindFlags.DEFAULT);
        }
    }
}
