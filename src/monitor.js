// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// For databases with persistent advisory lock files (APT/RPM). File existence
// cannot indicate whether those locks are held; coalesce actual database writes.
export class Monitor {
    constructor(directory, onChanged, accepts) {
        this._timer = 0;
        this._destroyed = false;
        this._onChanged = onChanged;
        this._monitor = Gio.File.new_for_path(directory)
            .monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._signal = this._monitor.connect('changed', (_monitor, file, otherFile) => {
            if (this._destroyed ||
                (!accepts(file?.get_basename() || '') && !accepts(otherFile?.get_basename() || '')))
                return;
            if (this._timer)
                GLib.Source.remove(this._timer);
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                this._timer = 0;
                this._onChanged?.();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        this._monitor.disconnect(this._signal);
        this._monitor.cancel();
        this._monitor = null;
        this._onChanged = null;
    }
}
