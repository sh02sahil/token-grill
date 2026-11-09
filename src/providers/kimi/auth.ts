import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {CollectorError} from '../../core/errors.js';
import {isCancellation} from '../../core/gio.js';
import {stringAt, toEpochMs} from '../../core/json.js';
import {expandPath, providerPaths} from '../../core/paths.js';
import type {ProviderInstance} from '../../core/types.js';
import {readCredentialJson, readCredentialText} from '../credentials.js';
import {readOpenCodeEntries} from '../opencode/authFile.js';
import {kimiApiHost} from './normalize.js';

export interface KimiAuth {
    token: string;
    host: string;
}

// The region host is optional configuration; without it Kimi Code uses the global host.
async function configuredHost(instance: ProviderInstance, cancellable: Gio.Cancellable): Promise<string> {
    try {
        return kimiApiHost(await readCredentialText(GLib.build_filenamev([expandPath(instance.accountHome), 'config.toml']), cancellable));
    } catch (error) {
        if (isCancellation(error) || !(error instanceof CollectorError))
            throw error;
        return kimiApiHost('');
    }
}

// The Kimi CLI refreshes its own sign-in; Token Grill only reads it.
export async function loadKimiAuth(instance: ProviderInstance, cancellable: Gio.Cancellable): Promise<KimiAuth> {
    if (instance.app === 'opencode') {
        const entry = (await readOpenCodeEntries(cancellable)).get('kimi-for-coding');
        if (entry?.type !== 'api')
            throw new CollectorError('auth-missing', ({_}) => _('OpenCode has no Kimi Code key.'));
        return {token: entry.key, host: kimiApiHost('')};
    }
    const payload = await readCredentialJson(providerPaths(instance).authFile, cancellable);
    const token = stringAt(payload, 'access_token');
    if (!token)
        throw new CollectorError('auth-missing', ({_}) => _('Kimi Code is not signed in.'));
    const expiresAt = toEpochMs(payload.expires_at);
    if (expiresAt !== null && expiresAt <= Date.now())
        throw new CollectorError('auth-expired', ({_}) => _('The Kimi Code sign-in has expired.'));
    return {token, host: await configuredHost(instance, cancellable)};
}
