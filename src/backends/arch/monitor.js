// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {closeStream, readText} from '../../streams.js';

const LOG_ATTRIBUTES = 'standard::type,standard::size,id::file';
const MAX_LOG_BYTES = 1024 * 1024;
const UPGRADE = /^\[[^\]\r\n]+\] \[ALPM\] upgraded \S+ \(\S+ -> \S+\)$/m;

export class Monitor {
    constructor(databasePath, logPath, onChanged) {
        this._onChanged = onChanged;
        this._dirty = false;
        this._upgraded = false;
        this._reading = false;
        this._logError = null;
        this._cancellable = new Gio.Cancellable();
        this._log = Gio.File.new_for_path(logPath);
        this._logId = null;
        this._logOffset = 0;
        this._destroyed = false;
        this._timer = 0;
        this._monitors = [];
        const database = Gio.File.new_for_path(databasePath);
        this._lock = database.get_child('db.lck');
        try {
            this._startAtLogEnd();
            this._watch(database, (_monitor, file, otherFile) => {
                if (this._dirty && (file?.get_basename() === 'db.lck' || otherFile?.get_basename() === 'db.lck'))
                    this._schedule();
            });
            this._watch(database.get_child('local'), () => {
                // Database writes alone don't tell us whether packages were upgraded.
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
        const id = monitor.connect('changed', (...args) => {
            if (!this._destroyed)
                callback(...args);
        });
        this._monitors.push({monitor, id});
    }

    _startAtLogEnd() {
        // Don't mistake upgrades from before the extension started for new ones.
        let info;
        try {
            info = this._log.query_info(LOG_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null);
        } catch (error) {
            if (error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
                return;
            throw error;
        }
        this._rememberLogEnd(info);
    }

    _rememberLogEnd(info) {
        if (info.get_file_type() !== Gio.FileType.REGULAR)
            throw new Error('Pacman LogFile is not a regular file.');
        this._logId = info.get_attribute_string('id::file');
        this._logOffset = info.get_size();
    }

    async _readUpgrades() {
        const stream = await new Promise((resolve, reject) => {
            this._log.read_async(GLib.PRIORITY_DEFAULT, this._cancellable, (file, result) => {
                try {
                    resolve(file.read_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
        try {
            const previousId = this._logId;
            const previousOffset = this._logOffset;
            this._rememberLogEnd(stream.query_info(LOG_ATTRIBUTES, this._cancellable));
            // Start from the beginning of a new or truncated log.
            const offset = this._logId === previousId && this._logOffset >= previousOffset ? previousOffset : 0;
            if (offset === this._logOffset)
                return false;
            const tooLarge = () => new Error('Pacman log changes exceeded 1 MiB.');
            if (this._logOffset - offset > MAX_LOG_BYTES)
                throw tooLarge();
            stream.seek(offset, GLib.SeekType.SET, this._cancellable);
            let size = 0;
            const text = await readText(stream, this._cancellable, length => {
                size += length;
                if (size > MAX_LOG_BYTES)
                    throw tooLarge();
            });
            // Retain a partial final line if another transaction started mid-read.
            const partial = text.slice(text.lastIndexOf('\n') + 1);
            this._logOffset = stream.tell() - new TextEncoder().encode(partial).length;
            return UPGRADE.test(text.slice(0, text.length - partial.length));
        } finally {
            await closeStream(stream);
        }
    }

    _schedule() {
        if (this._destroyed || this._reading)
            return;
        if (this._timer)
            GLib.Source.remove(this._timer);
        // Coalesce per-package events. If still locked, wait for the lock event.
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
            this._timer = 0;
            if (this._dirty && !this._lock.query_exists(null))
                this._checkLog();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _checkLog() {
        this._dirty = false;
        this._reading = true;
        try {
            const upgraded = await this._readUpgrades();
            this._upgraded ||= upgraded;
            this._logError = null;
        } catch (error) {
            if (!this._destroyed && error.message !== this._logError) {
                this._logError = error.message;
                console.warn(`Package Updates: could not read pacman log: ${error.message}`);
            }
        } finally {
            this._reading = false;
        }
        if (this._destroyed)
            return;
        if (this._lock.query_exists(null)) {
            this._dirty = true;
        } else if (this._dirty) {
            this._schedule();
        } else if (this._upgraded) {
            this._upgraded = false;
            this._onChanged();
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancellable.cancel();
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
