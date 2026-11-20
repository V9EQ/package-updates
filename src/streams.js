// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';

export async function readText(stream, cancellable, onBytes) {
    const chunks = [];
    let size = 0;
    while (true) {
        const bytes = await new Promise((resolve, reject) => {
            stream.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try {
                    resolve(source.read_bytes_finish(result));
                } catch (error) {
                    reject(error);
                }
            });
        });
        const data = bytes.get_data();
        if (!data?.length)
            break;
        onBytes(data.length);
        chunks.push(data);
        size += data.length;
    }
    // GJS does not support TextDecoder's streaming option. Decode once so a
    // multibyte character split across reads is still handled correctly.
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
    }
    return new TextDecoder('utf-8', {fatal: true}).decode(buffer);
}

export function closeStream(stream) {
    return new Promise((resolve, reject) => {
        stream.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try {
                source.close_finish(result);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}
