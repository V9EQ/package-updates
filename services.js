// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export const ISSUES_URL = 'https://gitlab.archlinux.org/groups/archlinux/packaging/packages/-/issues?state=opened&label_name%5B%5D=package%3A%3Aout-of-date';
const API_URL = 'https://gitlab.archlinux.org/api/v4/groups/archlinux%2Fpackaging%2Fpackages/issues';
const PACKAGE_URL_PREFIX = 'https://gitlab.archlinux.org/archlinux/packaging/packages/';

export class PackageService {
    constructor() {
        this._cancellable = new Gio.Cancellable();
        this._processes = new Set();
        this._session = new Soup.Session({
            user_agent: 'ArchUpdates/1.0 (GNOME Shell extension)',
            timeout: 30,
            idle_timeout: 15,
        });
    }

    destroy() {
        // GNU timeout forwards TERM to checkupdates and its pacman children.
        // Killing only the shell running checkupdates would orphan those children.
        for (const process of this._processes)
            process.send_signal(15);
        this._processes.clear();
        this._cancellable.cancel();
        this._session.abort();
    }

    async getUpdates() {
        const checkupdates = GLib.find_program_in_path('checkupdates');
        const timeout = GLib.find_program_in_path('timeout');
        if (!checkupdates)
            throw new Error('Install pacman-contrib to provide checkupdates.');
        if (!timeout)
            throw new Error('Install coreutils to provide timeout.');

        const database = GLib.build_filenamev([
            GLib.get_user_cache_dir(), 'arch-updates', 'checkupdates',
        ]);
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        launcher.setenv('LC_ALL', 'C', true);
        // A separate temporary database: never run pacman -Sy on the system DB.
        launcher.setenv('CHECKUPDATES_DB', database, true);
        const process = launcher.spawnv([
            timeout, '--kill-after=5s', '120s', checkupdates, '--nocolor',
        ]);
        this._processes.add(process);

        try {
            const [stdout, stderr] = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, this._cancellable, (source, result) => {
                    try {
                        const [, out, err] = source.communicate_utf8_finish(result);
                        resolve([out, err]);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (!process.get_if_exited())
                throw new Error('checkupdates was interrupted.');
            const status = process.get_exit_status();
            if (status === 2)
                return [];
            if (status === 124 || status === 137)
                throw new Error('checkupdates timed out after 120 seconds.');
            if (status !== 0)
                throw new Error(stderr.trim() || `checkupdates failed (exit ${status}).`);

            return stdout.split('\n').map(line => line.trim()).filter(Boolean)
                .map(line => ({name: line.split(/\s+/)[0], detail: line}))
                .sort((a, b) => a.name.localeCompare(b.name));
        } finally {
            this._processes.delete(process);
        }
    }

    async _getIssuesPage(page) {
        const url = `${API_URL}?state=opened&labels=package%3A%3Aout-of-date&per_page=100&page=${page}&order_by=created_at&sort=asc`;
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('Accept', 'application/json');
        const bytes = await new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT,
                this._cancellable, (session, result) => {
                    try {
                        resolve(session.send_and_read_finish(result));
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
        const next = message.response_headers.get_one('x-next-page');
        return {issues, next};
    }

    async getOutdated() {
        // Count unique package bases (GitLab projects), not duplicate issues.
        // Fetch every page; x-total counts issues, not package bases.
        const packages = new Map();
        let page = 1;
        const deadline = GLib.get_monotonic_time() + 120 * GLib.USEC_PER_SEC;
        for (let requests = 0; requests < 100; requests++) {
            if (GLib.get_monotonic_time() > deadline)
                throw new Error('GitLab check timed out; refusing a partial count.');
            const {issues, next} = await this._getIssuesPage(page);
            for (const issue of issues) {
                if (!Number.isInteger(issue.project_id) ||
                    typeof issue.web_url !== 'string' ||
                    !issue.web_url.startsWith(PACKAGE_URL_PREFIX))
                    throw new Error('GitLab returned an invalid package issue.');
                const path = issue.web_url.slice(PACKAGE_URL_PREFIX.length);
                const name = decodeURIComponent(path.split('/')[0]);
                packages.set(issue.project_id, {
                    name,
                    detail: `${name}: ${issue.title}`,
                    url: issue.web_url,
                });
            }
            // GitLab normally supplies x-next-page; tolerate its absence.
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
