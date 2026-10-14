import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {CollectorError} from '../../core/errors.js';
import {parseRecord, recordAt, stringAt, toEpochMs} from '../../core/json.js';
import {providerPaths} from '../../core/paths.js';
import type {ProviderInstance} from '../../core/types.js';
import {readCredentialJson} from '../credentials.js';

// Codex keeps the access token as a JWT; its `exp` claim tells whether a request is worth sending.
function jwtExpiry(token: string): number | null {
    const [, claims] = token.split('.');
    if (!claims)
        return null;
    const base64 = claims.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(claims.length / 4) * 4, '=');
    const payload = parseRecord(new TextDecoder().decode(GLib.base64_decode(base64)));
    return payload ? toEpochMs(payload.exp) : null;
}

export async function loadCodexAccessToken(instance: ProviderInstance, cancellable: Gio.Cancellable | null): Promise<string> {
    const payload = await readCredentialJson(providerPaths(instance).authFile, cancellable);
    const tokens = recordAt(payload, 'tokens');
    const accessToken = tokens ? stringAt(tokens, 'access_token') : null;
    if (!accessToken)
        throw new CollectorError('auth-missing', ({_}) => _('Codex is not signed in.'));
    const expiresAt = jwtExpiry(accessToken);
    if (expiresAt !== null && expiresAt <= Date.now())
        throw new CollectorError('auth-expired', ({_}) => _('The Codex sign-in has expired.'));
    return accessToken;
}
