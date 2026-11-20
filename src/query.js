// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {CommandRunner} from './command.js';
import {closeStream, readText} from './streams.js';

const MAX_JSON_BYTES = 4 * 1024 * 1024;

// One scan owns all of its resources; cancellation never affects another scan.
export class QueryScope {
    constructor(label, seconds = 120) {
        this._label = label;
        this.runner = new CommandRunner();
        this.cancellable = new Gio.Cancellable();
        this.session = null;
        this._timedOut = false;
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._timer = 0;
            this._timedOut = true;
            this.destroy();
            return GLib.SOURCE_REMOVE;
        });
    }

    checkActive() {
        if (this._timedOut)
            throw new Error(`${this._label} check timed out; refusing a partial count.`);
        if (this.cancellable.is_cancelled())
            throw new Error(`${this._label} check cancelled.`);
    }

    async getJson(url) {
        this.checkActive();
        if (!this.session) {
            this.session = new Soup.Session({
                user_agent: 'PackageUpdates/2.3 (GNOME Shell extension)',
                timeout: 30,
                idle_timeout: 5,
            });
        }
        const session = this.session;
        const message = Soup.Message.new('GET', url);
        message.set_flags(Soup.MessageFlags.NO_REDIRECT | Soup.MessageFlags.DO_NOT_USE_AUTH_CACHE);
        message.request_headers.append('Accept', 'application/json');
        const stream = await new Promise((resolve, reject) => {
            session.send_async(message, GLib.PRIORITY_DEFAULT, this.cancellable, (source, result) => {
                try {
                    resolve(source.send_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
        try {
            if (message.status_code !== 200)
                throw new Error(`${this._label} returned HTTP ${message.status_code}.`);
            if (message.response_headers.get_content_type()?.[0] !== 'application/json')
                throw new Error(`${this._label} returned a non-JSON response.`);
            if (message.response_headers.get_content_length() > MAX_JSON_BYTES)
                throw new Error(`${this._label} response exceeded 4 MiB.`);
            let size = 0;
            const text = await readText(stream, this.cancellable, length => {
                size += length;
                if (size > MAX_JSON_BYTES)
                    throw new Error(`${this._label} response exceeded 4 MiB.`);
            });
            this.checkActive();
            return JSON.parse(text);
        } catch (error) {
            session.abort();
            throw error;
        } finally {
            await closeStream(stream);
        }
    }

    destroy() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        this.cancellable.cancel();
        this.runner.destroy();
        this.session?.abort();
        this.session = null;
    }
}
