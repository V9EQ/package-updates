// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export const ISSUES_URL = 'https://gitlab.archlinux.org/groups/archlinux/packaging/packages/-/issues?state=opened&label_name%5B%5D=package%3A%3Aout-of-date';
const API_URL = 'https://gitlab.archlinux.org/api/v4/groups/archlinux%2Fpackaging%2Fpackages/issues';
const PACKAGE_URL_PREFIX = 'https://gitlab.archlinux.org/archlinux/packaging/packages/';

export class OutdatedService {
    constructor() {
        this._cancellable = new Gio.Cancellable();
        this._session = null;
    }

    cancel() {
        this._cancellable.cancel();
        this._cancellable = new Gio.Cancellable();
        this._session?.abort();
        this._session = null;
    }

    destroy() {
        this._cancellable.cancel();
        this._session?.abort();
        this._session = null;
    }

    async _getPage(page, session, cancellable) {
        const url = `${API_URL}?state=opened&labels=package%3A%3Aout-of-date&per_page=100&page=${page}&order_by=created_at&sort=asc`;
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('Accept', 'application/json');
        const bytes = await new Promise((resolve, reject) => {
            session.send_and_read_async(message, GLib.PRIORITY_DEFAULT,
                cancellable, (source, result) => {
                    try {
                        resolve(source.send_and_read_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
        });
        if (message.status_code === 429)
            throw new Error('GitLab rate limit reached. Try again later.');
        if (message.status_code !== 200)
            throw new Error(`GitLab returned HTTP ${message.status_code}.`);
        if (!message.response_headers.get_content_type()?.[0]?.includes('json'))
            throw new Error('GitLab returned a non-JSON response (possibly bot protection).');
        const issues = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        if (!Array.isArray(issues))
            throw new Error('GitLab returned an invalid issues response.');
        return {issues, next: message.response_headers.get_one('x-next-page')};
    }

    async getPackages() {
        if (!this._session) {
            this._session = new Soup.Session({
                user_agent: 'PackageUpdates/2.0 (GNOME Shell extension)',
                timeout: 30,
                idle_timeout: 15,
            });
        }
        const session = this._session;
        const cancellable = this._cancellable;
        const packages = new Map();
        const deadline = GLib.get_monotonic_time() + 120 * GLib.USEC_PER_SEC;
        let page = 1;
        for (let requests = 0; requests < 100; requests++) {
            if (GLib.get_monotonic_time() > deadline)
                throw new Error('GitLab check timed out; refusing a partial count.');
            const {issues, next} = await this._getPage(page, session, cancellable);
            for (const issue of issues) {
                if (!Number.isInteger(issue.project_id) || typeof issue.web_url !== 'string' ||
                    !issue.web_url.startsWith(PACKAGE_URL_PREFIX))
                    throw new Error('GitLab returned an invalid package issue.');
                const path = issue.web_url.slice(PACKAGE_URL_PREFIX.length);
                const name = decodeURIComponent(path.split('/')[0]);
                packages.set(issue.project_id, {name, detail: `${name}: ${issue.title}`, url: issue.web_url});
            }
            if (next === '' || (next === null && issues.length < 100))
                return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
            const nextPage = next === null ? page + 1 : Number(next);
            if (!Number.isInteger(nextPage) || nextPage <= page)
                throw new Error('GitLab returned invalid pagination.');
            page = nextPage;
        }
        throw new Error('GitLab pagination limit reached; refusing a partial count.');
    }
}
