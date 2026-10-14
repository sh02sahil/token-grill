import {CollectorError} from '../../core/errors.js';

// Failures that depend only on the stored credentials: the account behind the
// token, or refresh material the service has already refused.
const PERSISTENT_CODES = new Set(['unsupported-account', 'auth-expired']);

// Kiro answers GetUsageLimits with 403 FEATURE_NOT_SUPPORTED when the signed-in
// account has no Kiro usage (for example a user removed from the subscription
// whose Identity Center login still works). The token itself is fine, so the
// error gets its own code and message.
export function kiroUsageError(error: unknown): unknown {
    if (error instanceof CollectorError && error.status === 403 && error.reason === 'FEATURE_NOT_SUPPORTED') {
        return new CollectorError('unsupported-account', ({_}) => _('kiro-cli is signed in to an account without Kiro usage.'),
            {status: error.status, reason: error.reason});
    }
    return error;
}

// Remembers failures that cannot change until kiro-cli's stored credentials
// change, so a rejected token is not sent again on every scheduled refresh.
// Entries are keyed by account and by a fingerprint of the stored credentials,
// so whatever kiro-cli holds next is always checked.
export class KiroRejectedTokens {
    private readonly _entries = new Map<string, {fingerprint: string; error: CollectorError}>();

    get(instanceId: string, fingerprint: string): CollectorError | null {
        const entry = this._entries.get(instanceId);
        return entry?.fingerprint === fingerprint ? entry.error : null;
    }

    remember(instanceId: string, fingerprint: string, error: unknown): boolean {
        if (!(error instanceof CollectorError) || !PERSISTENT_CODES.has(error.code))
            return false;
        this._entries.set(instanceId, {fingerprint, error});
        return true;
    }

    forget(instanceId: string): void {
        this._entries.delete(instanceId);
    }
}
