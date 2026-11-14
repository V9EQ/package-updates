// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ArchUpdatesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(620, 480);
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
            subtitle: 'Move the indicator without restarting GNOME Shell',
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
            title: 'Check interval',
            subtitle: 'Minutes between checks (default: 5)',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 1440, step_increment: 1, page_increment: 5,
            }),
            digits: 0,
        });
        polling.add(interval);
        settings.bind('refresh-interval', interval, 'value', Gio.SettingsBindFlags.DEFAULT);

        const about = new Adw.PreferencesGroup({
            title: 'Data sources',
            description: 'No packages are installed, downloaded or upgraded by this extension.',
        });
        page.add(about);
        about.add(new Adw.ActionRow({
            title: 'Available updates',
            subtitle: 'Uses checkupdates from pacman-contrib with a separate database. AUR updates are not included.',
        }));
        about.add(new Adw.ActionRow({
            title: 'Out-of-date packages',
            subtitle: 'All Arch package bases with open package::out-of-date reports on GitLab, not just installed packages. Multiple reports for one package base count once.',
        }));
        about.add(new Adw.ActionRow({
            title: 'Panel status',
            subtitle: '… = checking, ! = unavailable, * = last known count after a failed check. Open the menu for details.',
        }));
    }
}
