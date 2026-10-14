import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {isIoError} from '../core/gio.js';

const APP_DIRECTORY = 'token-grill';
const MAX_STATE_BYTES = 4 * 1024 * 1024;

export function dataPath(filename: string): string {
    return GLib.build_filenamev([GLib.get_user_data_dir(), APP_DIRECTORY, filename]);
}

export function statePath(filename: string): string {
    return GLib.build_filenamev([GLib.get_user_state_dir(), APP_DIRECTORY, filename]);
}

export type WarningLogger = Pick<Console, 'warn'>;

// A missing file is the normal first run. A damaged one is reported once and
// replaced by the fallback, so a bad state file never blocks the extension.
export async function readJson<T>(path: string, fallback: T, cancellable: Gio.Cancellable, logger: WarningLogger): Promise<T> {
    const file = Gio.File.new_for_path(path);
    let text: string;
    try {
        const info = await file.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > MAX_STATE_BYTES) {
            logger.warn(`Ignoring ${path}: not a regular file or larger than ${MAX_STATE_BYTES} bytes`);
            return fallback;
        }
        const [contents] = await file.load_contents_async(cancellable);
        text = new TextDecoder().decode(contents);
    } catch (error) {
        if (isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
            return fallback;
        throw error;
    }
    try {
        return JSON.parse(text) as T;
    } catch {
        logger.warn(`Ignoring unreadable state file ${path}`);
        return fallback;
    }
}

async function makeDirectory(directory: Gio.File, cancellable: Gio.Cancellable | null): Promise<void> {
    try {
        await directory.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable);
    } catch (error) {
        if (isIoError(error, Gio.IOErrorEnum.EXISTS))
            return;
        const parent = directory.get_parent();
        if (!parent || !isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
            throw error;
        await makeDirectory(parent, cancellable);
        await makeDirectory(directory, cancellable);
        return;
    }
    // Only directories created here are restricted; existing ones keep the user's mode.
    const permissions = new Gio.FileInfo();
    permissions.set_attribute_uint32('unix::mode', 0o700);
    await directory.set_attributes_async(permissions, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
}

async function writeFileAtomic(path: string, text: string, cancellable: Gio.Cancellable | null): Promise<void> {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (parent)
        await makeDirectory(parent, cancellable);
    const flags = Gio.FileCreateFlags.REPLACE_DESTINATION | Gio.FileCreateFlags.PRIVATE;
    await file.replace_contents_bytes_async(new TextEncoder().encode(text), null, false, flags, cancellable);
    // PRIVATE applies only when the file is created; a file that already
    // existed with a wider mode is tightened as well.
    const permissions = new Gio.FileInfo();
    permissions.set_attribute_uint32('unix::mode', 0o600);
    await file.set_attributes_async(permissions, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
}

// Writes one state file in order, never two at once. Writes take no
// cancellable: the last flush runs after disable() has cancelled everything
// else, and replacing a file is atomic, so an unfinished write loses nothing.
export class SerialWriter {
    readonly path: string;
    private _dirty = false;
    private _pending: Promise<void> = Promise.resolve();

    constructor(path: string) {
        this.path = path;
    }

    markDirty(): void {
        this._dirty = true;
    }

    // A failed write marks the data dirty again, so the next flush retries it.
    flush(contents: () => unknown): Promise<void> {
        if (!this._dirty)
            return this._pending;
        this._dirty = false;
        const text = JSON.stringify(contents());
        const write = (): Promise<void> => writeFileAtomic(this.path, text, null).catch((error: unknown) => {
            this._dirty = true;
            throw error;
        });
        this._pending = this._pending.then(write, write);
        return this._pending;
    }
}
