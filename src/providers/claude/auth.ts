import type Gio from 'gi://Gio';

import {CollectorError} from '../../core/errors.js';
import {recordAt, stringAt, toEpochMs} from '../../core/json.js';
import {providerPaths} from '../../core/paths.js';
import type {ProviderInstance} from '../../core/types.js';
import {readCredentialJson} from '../credentials.js';

export async function loadClaudeAccessToken(instance: ProviderInstance, cancellable: Gio.Cancellable | null): Promise<string> {
    const payload = await readCredentialJson(providerPaths(instance).authFile, cancellable);
    const oauth = recordAt(payload, 'claudeAiOauth');
    const accessToken = oauth ? stringAt(oauth, 'accessToken') : null;
    if (!oauth || !accessToken)
        throw new CollectorError('auth-missing', ({_}) => _('Claude Code is not signed in.'));
    const expiresAt = toEpochMs(oauth.expiresAt);
    if (expiresAt !== null && expiresAt <= Date.now())
        throw new CollectorError('auth-expired', ({_}) => _('The Claude Code sign-in has expired.'));
    return accessToken;
}
