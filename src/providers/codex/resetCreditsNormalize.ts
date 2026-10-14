import {isRecord, numberAt, stringAt, toEpochMs} from '../../core/json.js';
import type {LimitResetCredit, LimitResetCreditSummary} from '../../core/types.js';

function isAvailable(credit: Record<string, unknown>): boolean {
    const status = stringAt(credit, 'status');
    if (status)
        return status.toLowerCase() === 'available';
    // Older responses list only unredeemed credits and leave the status out.
    return toEpochMs(credit.redeemed_at) === null;
}

function normalizeCredit(credit: Record<string, unknown>): LimitResetCredit {
    return {title: stringAt(credit, 'title'), expiresAt: toEpochMs(credit.expires_at)};
}

export function normalizeResetCredits(payload: unknown, fetchedAt = Date.now()): LimitResetCreditSummary | null {
    if (!isRecord(payload))
        return null;
    const credits = Array.isArray(payload.credits) ? payload.credits.filter(isRecord).filter(isAvailable).map(normalizeCredit) : [];
    const count = numberAt(payload, 'available_count');
    return {
        availableCount: count === null ? credits.length : Math.max(0, Math.round(count)),
        credits,
        fetchedAt,
        stale: false,
        error: null,
    };
}
