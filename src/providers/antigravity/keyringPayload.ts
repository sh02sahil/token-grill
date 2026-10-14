import {parseRecord, recordAt, stringAt} from '../../core/json.js';

// The agy CLI stores its OAuth token through go-keyring, which on Linux is a
// generic Secret Service item with these attributes.
export const AGY_KEYRING_SCHEMA = 'org.freedesktop.Secret.Generic';
export const AGY_KEYRING_ATTRIBUTES = {service: 'gemini', username: 'antigravity'};

export interface AgyKeyringToken {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
}

// The item holds Go's serialized oauth2.Token; `expiry` is RFC 3339 with
// nanoseconds, which Date.parse accepts.
export function parseAgyKeyringPayload(raw: string): AgyKeyringToken | null {
    const payload = parseRecord(raw);
    const token = payload ? recordAt(payload, 'token') : null;
    const accessToken = token ? stringAt(token, 'access_token') : null;
    if (!token || !accessToken)
        return null;
    const expiresAt = Date.parse(stringAt(token, 'expiry') ?? '');
    return {
        accessToken,
        refreshToken: stringAt(token, 'refresh_token'),
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    };
}
