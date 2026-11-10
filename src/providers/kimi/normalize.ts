// Kimi Code's usage endpoint is undocumented and public descriptions of it
// disagree, so both layouts are read: `usages.limit_*` with used ratios, and a
// `usage` block plus `limits[]` with counts (numbers may be strings).
import {isRecord, recordAt, stringAt, toEpochMs} from '../../core/json.js';
import type {CanonicalQuotaWindow, UsageWindow} from '../../core/types.js';
import {claimType, windowLabel} from '../windows.js';

const RATIO_WINDOWS: [string, CanonicalQuotaWindow, string][] = [
    ['limit_5h', 'five-hour', ''],
    ['limit_7d', 'weekly', ''],
    ['limit_month_total', 'monthly', ''],
    ['limit_month_code', 'other', 'Monthly Code'],
];

function count(value: unknown): number | null {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function makeWindow(id: string, canonicalWindow: CanonicalQuotaWindow, label: string, percent: number, reset: unknown): UsageWindow {
    return {
        id, canonicalWindow, label: windowLabel(canonicalWindow, label), used: null, limit: null,
        percent: Math.max(0, Math.min(1, percent)), resetAt: toEpochMs(reset), unit: null,
    };
}

function ratioWindows(usages: Record<string, unknown>): UsageWindow[] {
    return RATIO_WINDOWS.flatMap(([id, canonical, label]) => {
        const item = recordAt(usages, id);
        const ratio = item ? count(item.used_ratio) : null;
        return item && ratio !== null ? [makeWindow(id, canonical, label, ratio, item.reset_time)] : [];
    });
}

function windowKind(window: Record<string, unknown> | null): CanonicalQuotaWindow {
    const duration = window ? count(window.duration) : null;
    const unit = window ? stringAt(window, 'timeUnit') : null;
    if ((unit === 'MINUTE' && duration === 300) || (unit === 'HOUR' && duration === 5))
        return 'five-hour';
    return unit === 'DAY' && duration === 7 ? 'weekly' : 'other';
}

function countWindow(id: string, canonical: CanonicalQuotaWindow, label: string, detail: Record<string, unknown>): UsageWindow | null {
    const limit = count(detail.limit);
    const remaining = count(detail.remaining);
    const used = count(detail.used) ?? (limit !== null && remaining !== null ? limit - remaining : null);
    if (limit === null || limit <= 0 || used === null)
        return null;
    return makeWindow(id, canonical, label, used / limit, detail.resetTime ?? detail.reset_time);
}

export function normalizeKimiUsage(payload: unknown): UsageWindow[] {
    if (!isRecord(payload))
        return [];
    const usages = recordAt(payload, 'usages');
    const byRatio = usages ? ratioWindows(usages) : [];
    if (byRatio.length)
        return byRatio;
    const windows: UsageWindow[] = [];
    const claimed = new Set<CanonicalQuotaWindow>();
    const usage = recordAt(payload, 'usage');
    const weekly = usage ? countWindow('usage', 'weekly', '', usage) : null;
    if (weekly) {
        claimed.add('weekly');
        windows.push(weekly);
    }
    const limits = Array.isArray(payload.limits) ? payload.limits : [];
    limits.forEach((item, index) => {
        if (!isRecord(item))
            return;
        const type = claimType(claimed, windowKind(recordAt(item, 'window')), stringAt(item, 'name') ?? 'Usage Limit');
        const window = countWindow(`limit-${index}`, type.canonicalWindow, type.label, recordAt(item, 'detail') ?? item);
        if (window)
            windows.push(window);
    });
    return windows;
}

// Kimi Code serves the global and mainland China regions from different hosts.
export function kimiApiHost(configToml: string): string {
    return /api\.kimi\.ai/.test(configToml) ? 'api.kimi.ai' : 'api.kimi.com';
}
