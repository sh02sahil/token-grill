import {clampFraction, isRecord, numberAt, recordAt, stringAt, toEpochMs} from '../../core/json.js';
import type {CanonicalQuotaWindow, UsageWindow} from '../../core/types.js';
import {windowLabel} from '../windows.js';

const LEGACY_WINDOWS: Array<[string, CanonicalQuotaWindow]> = [
    ['five_hour', 'five-hour'],
    ['seven_day', 'weekly'],
    ['seven_day_opus', 'other'],
    ['seven_day_sonnet', 'other'],
];

const LIMIT_GROUPS: Record<string, CanonicalQuotaWindow> = {
    session: 'five-hour',
    weekly: 'weekly',
};

function scopeName(scope: Record<string, unknown> | null): string | null {
    if (!scope)
        return null;
    const model = recordAt(scope, 'model');
    const name = model ? stringAt(model, 'display_name') ?? stringAt(model, 'id') : null;
    return [name, stringAt(scope, 'surface')].filter(Boolean).join(' · ') || null;
}

// Claude reports utilization in percentage points (0-100), including
// fractional values: 1 means 1% used, not a fully consumed ratio.
function makeWindow(id: string, canonicalWindow: CanonicalQuotaWindow, label: string, percentagePoints: number, reset: unknown): UsageWindow {
    return {
        id,
        canonicalWindow,
        label,
        used: null,
        limit: null,
        percent: clampFraction(percentagePoints / 100),
        resetAt: toEpochMs(reset),
        unit: null,
    };
}

// The newer `limits` array carries windows that the legacy keys may leave null,
// such as model-scoped weekly limits. Only windows the legacy keys did not
// provide are taken from it, preferring unscoped limits over scoped ones.
function limitWindows(limits: unknown, present: Set<CanonicalQuotaWindow>): UsageWindow[] {
    if (!Array.isArray(limits))
        return [];
    const chosen = new Map<CanonicalQuotaWindow, {window: UsageWindow; scoped: boolean}>();
    for (const item of limits.filter(isRecord)) {
        const percent = numberAt(item, 'percent');
        const group = stringAt(item, 'group') ?? '';
        const canonicalWindow = LIMIT_GROUPS[group];
        if (percent === null || !canonicalWindow || present.has(canonicalWindow))
            continue;
        const scope = scopeName(recordAt(item, 'scope'));
        const existing = chosen.get(canonicalWindow);
        if (existing && (!existing.scoped || scope))
            continue;
        const kind = stringAt(item, 'kind') ?? group;
        const base = windowLabel(canonicalWindow, kind);
        const id = scope ? `limits:${kind}:${scope}` : `limits:${kind}`;
        const window = makeWindow(id, canonicalWindow, scope ? `${base} · ${scope}` : base, percent, item.resets_at);
        chosen.set(canonicalWindow, {window, scoped: Boolean(scope)});
    }
    return [...chosen.values()].map(entry => entry.window);
}

export function normalizeClaudeUsage(payload: unknown): UsageWindow[] {
    if (!isRecord(payload))
        return [];
    const windows: UsageWindow[] = [];
    for (const [key, canonicalWindow] of LEGACY_WINDOWS) {
        const item = recordAt(payload, key);
        const utilization = item ? numberAt(item, 'utilization') : null;
        if (item && utilization !== null)
            windows.push(makeWindow(key, canonicalWindow, windowLabel(canonicalWindow, key.replaceAll('_', ' ')), utilization, item.resets_at));
    }
    windows.push(...limitWindows(payload.limits, new Set(windows.map(window => window.canonicalWindow))));
    return windows;
}
