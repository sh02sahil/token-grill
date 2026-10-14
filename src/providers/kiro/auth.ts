import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Gda from 'gi://Gda?version=5.0';

import {CollectorError} from '../../core/errors.js';
import {isIoError} from '../../core/gio.js';
import {formatText} from '../../core/i18n.js';
import {displayPath, providerPaths} from '../../core/paths.js';
import type {ProviderInstance} from '../../core/types.js';
import {credentialErrorStatus, credentialFileError, type CredentialStatus} from '../credentials.js';
import {isKiroRefreshable, isKiroTokenFresh, parseKiroAuthRecords, type KiroAuth} from './authRecords.js';

// kiro-cli spells its OIDC keys "odic".
const TOKEN_QUERY = "SELECT value FROM auth_kv WHERE key = 'kirocli:odic:token'";
const REGISTRATION_QUERY = "SELECT value FROM auth_kv WHERE key = 'kirocli:odic:device-registration'";
// The state table declares its values as BLOB, which libgda only returns as text through a cast.
const PROFILE_QUERY = "SELECT CAST(value AS TEXT) FROM state WHERE key = 'api.codewhisperer.profile'";
const STAMP_ATTRIBUTES = 'standard::size,time::modified,time::modified-usec';

async function importGda(): Promise<typeof Gda> {
    let module: {default: typeof Gda};
    try {
        module = await import('gi://Gda?version=5.0');
    } catch {
        throw new CollectorError('dependency', ({_}) => _('Kiro accounts need the Gda 5.0 library (gir1.2-gda-5.0).'));
    }
    module.default.init();
    return module.default;
}

async function fileStamp(path: string, cancellable: Gio.Cancellable | null): Promise<string | null> {
    try {
        const info = await Gio.File.new_for_path(path).query_info_async(
            STAMP_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        const modified = `${info.get_attribute_uint64('time::modified')}.${info.get_attribute_uint32('time::modified-usec')}`;
        return `${modified}:${info.get_size()}`;
    } catch (error) {
        if (isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw error;
    }
}

// Changes when kiro-cli writes to its database, including writes still held in the write-ahead log.
export async function kiroDatabaseStamp(path: string, cancellable: Gio.Cancellable | null): Promise<string> {
    let stamps: Array<string | null>;
    try {
        stamps = await Promise.all([fileStamp(path, cancellable), fileStamp(`${path}-wal`, cancellable)]);
    } catch (error) {
        throw credentialFileError(error, path);
    }
    if (stamps[0] === null)
        throw new CollectorError('auth-missing', ({_}) => _('kiro-cli is not signed in.'));
    return stamps.join('|');
}

function selectText(connection: Gda.Connection, query: string): string | null {
    const model = connection.execute_select_command(query);
    if (model.get_n_rows() < 1)
        return null;
    const value = model.get_value_at(0, 0);
    return typeof value === 'string' ? value : null;
}

// libgda 5 offers no asynchronous queries. The read is a few small rows, and
// callers only make it after the database changed on disk.
export async function readKiroAuth(path: string): Promise<KiroAuth> {
    const Gda = await importGda();
    const directory = Gda.rfc1738_encode(GLib.path_get_dirname(path));
    const name = Gda.rfc1738_encode(GLib.path_get_basename(path));
    let connection: Gda.Connection;
    try {
        connection = Gda.Connection.open_from_string('SQLite', `DB_DIR=${directory};DB_NAME=${name}`, null, Gda.ConnectionOptions.READ_ONLY);
    } catch (error) {
        throw databaseError(error, path);
    }
    try {
        // READ_ONLY is advisory in some libgda SQLite builds; query_only makes
        // SQLite itself refuse writes. libgda classifies PRAGMA as a selection.
        connection.execute_select_command('PRAGMA query_only = ON');
        return parseKiroAuthRecords({
            token: selectText(connection, TOKEN_QUERY),
            registration: selectText(connection, REGISTRATION_QUERY),
            profile: selectText(connection, PROFILE_QUERY),
        });
    } catch (error) {
        throw databaseError(error, path);
    } finally {
        connection.close();
    }
}

function databaseError(error: unknown, path: string): unknown {
    if (!(error instanceof GLib.Error))
        return error;
    return new CollectorError('auth-invalid', ({_}) => formatText(_('The kiro-cli database at %s could not be read.'), displayPath(path)));
}

export async function kiroCredentialStatus(instance: ProviderInstance, cancellable: Gio.Cancellable | null): Promise<CredentialStatus> {
    const path = providerPaths(instance).authFile;
    let auth: KiroAuth;
    try {
        await kiroDatabaseStamp(path, cancellable);
        auth = await readKiroAuth(path);
    } catch (error) {
        return credentialErrorStatus(error);
    }
    if (isKiroTokenFresh(auth))
        return 'authenticated';
    return isKiroRefreshable(auth) ? 'expired-refreshable' : 'login-required';
}
