// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

const BACKENDS = ['arch', 'ubuntu', 'debian', 'fedora'];

export function detectSystem() {
    // GLib implements os-release quoting and /etc vs /usr/lib precedence.
    const id = GLib.get_os_info('ID') || 'linux';
    const version = GLib.get_os_info('VERSION_ID') || '';
    const name = GLib.get_os_info('PRETTY_NAME') || GLib.get_os_info('NAME') || 'Linux';
    const candidates = [id, ...(GLib.get_os_info('ID_LIKE') || '').split(/\s+/).filter(Boolean)];
    const backendId = candidates.find(candidate => BACKENDS.includes(candidate)) || null;
    const imageBased = GLib.file_test('/run/ostree-booted', GLib.FileTest.EXISTS) ||
        ['silverblue', 'kinoite', 'coreos', 'sericea', 'onyx'].includes(GLib.get_os_info('VARIANT_ID'));
    return {
        id,
        version,
        name,
        backendId: imageBased ? null : backendId,
        derived: backendId !== null && backendId !== id,
        reason: imageBased ? 'Image-based systems are not supported.'
            : backendId ? null : `Unsupported distribution: ${name}`,
    };
}
