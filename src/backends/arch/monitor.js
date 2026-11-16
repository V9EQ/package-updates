// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class Monitor {
    constructor(databasePath, onChanged) {
        this._onChanged = onChanged;
        this._dirty = false;
        this._timer = 0;
        this._monitors = [];
        const database = Gio.File.new_for_path(databasePath);
        this._lock = database.get_child('db.lck');
        try {
            this._watch(database, (_monitor, file) => {
                if (file.get_basename() === 'db.lck' && this._dirty)
                    this._schedule();
            });
            this._watch(database.get_child('local'), () => {
                // Lock creation/removal alone is not a package installation.
                // An aborted confirmation prompt must not refresh the counter.
                this._dirty = true;
                this._schedule();
            });
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _watch(file, callback) {
        const monitor = file.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        const id = monitor.connect('changed', callback);
        this._monitors.push({monitor, id});
    }

    _schedule() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        // Coalesce per-package events and allow the database lock to disappear.
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
            this._timer = 0;
            if (this._dirty && !this._lock.query_exists(null)) {
                this._dirty = false;
                this._onChanged();
            }
            // If still locked, wait for its file-monitor event, not a poll loop.
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        for (const {monitor, id} of this._monitors) {
            monitor.disconnect(id);
            monitor.cancel();
        }
        this._monitors = [];
        this._dirty = false;
        this._onChanged = null;
    }
}
