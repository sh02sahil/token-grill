import type Gio from 'gi://Gio';

import {CollectorError} from '../../core/errors.js';
import {lookupSecret, type KeyringTexts} from '../keyring.js';
import {AGY_KEYRING_ATTRIBUTES, AGY_KEYRING_SCHEMA, parseAgyKeyringPayload, type AgyKeyringToken} from './keyringPayload.js';

const AGY_KEYRING_TEXTS: KeyringTexts = {
    missingLibrary: ({_}) => _('Antigravity CLI accounts need the libsecret library (gir1.2-secret-1).'),
    unavailable: ({_}) => _('The system keyring is not available, so the agy sign-in cannot be read.'),
};

export async function lookupAgyKeyringToken(cancellable: Gio.Cancellable): Promise<AgyKeyringToken | null> {
    const raw = await lookupSecret(AGY_KEYRING_SCHEMA, AGY_KEYRING_ATTRIBUTES, cancellable, AGY_KEYRING_TEXTS);
    if (!raw)
        return null;
    const token = parseAgyKeyringPayload(raw);
    if (!token)
        throw new CollectorError('auth-invalid', ({_}) => _('The agy sign-in in the system keyring could not be read.'));
    return token;
}
