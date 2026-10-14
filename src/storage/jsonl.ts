import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Small reads keep every callback on the Shell main loop short.
const CHUNK_SIZE = 64 * 1024;
// Longer lines are tool output, not usage records, and are skipped without being buffered.
const MAX_LINE_BYTES = 256 * 1024;
const NEWLINE = 0x0a;

function joinParts(parts: Uint8Array[], length: number): Uint8Array {
    if (parts.length === 1)
        return parts[0]!;
    const joined = new Uint8Array(length);
    let position = 0;
    for (const part of parts) {
        joined.set(part, position);
        position += part.length;
    }
    return joined;
}

// Returns the offset just past the last complete line, so a line that is still
// being written is read again in full on the next pass.
export async function scanJsonl(
    file: Gio.File,
    startOffset: number,
    onLine: (line: string) => void,
    cancellable: Gio.Cancellable
): Promise<number> {
    const input = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
    try {
        // Seeking only moves the descriptor offset; there is no asynchronous variant and no disk I/O.
        input.seek(startOffset, GLib.SeekType.SET, cancellable);
        const decoder = new TextDecoder();
        let parts: Uint8Array[] = [];
        let partLength = 0;
        let overlong = false;
        let position = startOffset;
        let lineEnd = startOffset;
        for (;;) {
            // eslint-disable-next-line no-await-in-loop -- a stream is read in order
            const bytes = await input.read_bytes_async(CHUNK_SIZE, GLib.PRIORITY_DEFAULT, cancellable);
            const chunk = bytes.toArray();
            if (!chunk.length)
                break;
            let start = 0;
            for (let newline = chunk.indexOf(NEWLINE); newline !== -1; newline = chunk.indexOf(NEWLINE, start)) {
                if (!overlong && partLength + newline - start <= MAX_LINE_BYTES) {
                    parts.push(chunk.subarray(start, newline));
                    onLine(decoder.decode(joinParts(parts, partLength + newline - start)));
                }
                parts = [];
                partLength = 0;
                overlong = false;
                start = newline + 1;
                lineEnd = position + start;
            }
            const rest = chunk.length - start;
            if (overlong || partLength + rest > MAX_LINE_BYTES) {
                overlong = true;
                parts = [];
                partLength = 0;
            } else if (rest) {
                parts.push(chunk.slice(start));
                partLength += rest;
            }
            position += chunk.length;
        }
        return lineEnd;
    } finally {
        await input.close_async(GLib.PRIORITY_DEFAULT, null);
    }
}
