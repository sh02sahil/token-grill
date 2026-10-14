import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {CollectorError} from '../core/errors.js';
import {isCancellation, isIoError} from '../core/gio.js';
import {formatText} from '../core/i18n.js';
import {parseRecord} from '../core/json.js';
import {displayPath} from '../core/paths.js';

const MAX_CREDENTIAL_BYTES = 1024 * 1024;

// The answers the preferences show for credentials they cannot check by reading a single file.
export type CredentialStatus =
    | 'authenticated'
    | 'expired-refreshable'
    | 'expired-external'
    | 'login-required'
    | 'database-unreadable'
    | 'dependency-missing';

export function credentialErrorStatus(error: unknown): CredentialStatus {
    if (!(error instanceof CollectorError))
        throw error;
    if (error.code === 'dependency')
        return 'dependency-missing';
    if (error.code === 'auth-missing')
        return 'login-required';
    return 'database-unreadable';
}

// Maps the expected failures of reading another tool's file; cancellation passes through.
export function credentialFileError(error: unknown, path: string): unknown {
    if (isCancellation(error) || !(error instanceof GLib.Error))
        return error;
    const shown = displayPath(path);
    if (isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
        return new CollectorError('auth-missing', ({_}) => formatText(_('No credentials were found at %s.'), shown));
    if (isIoError(error, Gio.IOErrorEnum.PERMISSION_DENIED))
        return new CollectorError('permission', ({_}) => formatText(_('Token Grill is not allowed to read %s.'), shown));
    return new CollectorError('auth-invalid', ({_}) => formatText(_('%s could not be read.'), shown));
}

export async function readCredentialJson(path: string, cancellable: Gio.Cancellable | null): Promise<Record<string, unknown>> {
    const file = Gio.File.new_for_path(path);
    const shown = displayPath(path);
    let contents: Uint8Array;
    try {
        const info = await file.query_info_async('standard::type,standard::size', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > MAX_CREDENTIAL_BYTES)
            throw new CollectorError('auth-invalid', ({_}) => formatText(_('%s is not a credential file.'), shown));
        [contents] = await file.load_contents_async(cancellable);
    } catch (error) {
        throw credentialFileError(error, path);
    }
    const payload = parseRecord(new TextDecoder().decode(contents));
    if (!payload)
        throw new CollectorError('auth-invalid', ({_}) => formatText(_('%s does not contain valid credentials.'), shown));
    return payload;
}
