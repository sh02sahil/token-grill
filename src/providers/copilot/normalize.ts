// Field names from a real copilot_internal/user response (Copilot Free, 2026-11):
// quota_snapshots.{chat, completions, premium_interactions}, each with entitlement,
// percent_remaining and unlimited, plus quota_reset_date_utc and access_type_sku.
import {CollectorError} from '../../core/errors.js';
import {isRecord, numberAt, recordAt, stringAt, toEpochMs} from '../../core/json.js';
import type {CanonicalQuotaWindow, UsageWindow} from '../../core/types.js';
import {windowLabel} from '../windows.js';

const SNAPSHOTS: [string, CanonicalQuotaWindow, string][] = [
    ['premium_interactions', 'monthly', 'Premium Requests'],
    ['chat', 'other', 'Chat'],
    ['completions', 'other', 'Code Completions'],
];

export interface CopilotUsage {
    windows: UsageWindow[];
    plan: string | null;
}

// A snapshot with no entitlement is a feature the plan lacks (Copilot Free has no
// premium requests); reading its percent_remaining of 0 as "all used" would be wrong.
function snapshotWindow(snapshot: unknown, id: string, canonicalWindow: CanonicalQuotaWindow, label: string, resetAt: number | null): UsageWindow | null {
    if (!isRecord(snapshot) || snapshot.unlimited === true)
        return null;
    const entitlement = numberAt(snapshot, 'entitlement');
    const percentRemaining = numberAt(snapshot, 'percent_remaining');
    if (entitlement === null || entitlement <= 0 || percentRemaining === null)
        return null;
    const percent = Math.max(0, Math.min(1, 1 - percentRemaining / 100));
    return {id, canonicalWindow, label: windowLabel(canonicalWindow, label), used: null, limit: null, percent, resetAt, unit: null};
}

export function normalizeCopilotUsage(payload: unknown): CopilotUsage {
    const root = isRecord(payload) ? payload : {};
    const snapshots = recordAt(root, 'quota_snapshots') ?? {};
    const resetAt = toEpochMs(root.quota_reset_date_utc);
    const windows = SNAPSHOTS.flatMap(([id, canonical, label]) => snapshotWindow(snapshots[id], id, canonical, label, resetAt) ?? []);
    if (!windows.length)
        throw new CollectorError('unsupported-account', ({_}) => _('This GitHub account has no Copilot usage limit.'));
    const plan = stringAt(root, 'access_type_sku') === 'free_limited_copilot' ? 'Copilot Free' : stringAt(root, 'copilot_plan');
    return {windows, plan};
}
