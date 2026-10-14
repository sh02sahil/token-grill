import {formatText, type Translator} from './i18n.js';
import type {
    CanonicalQuotaWindow,
    PanelPercentageMode,
    ProviderInstance,
    ProviderSnapshot,
    QuotaWindowPreference,
    UsageWindow,
} from './types.js';

// Providers that do not tag their windows are matched by id or label.
const WINDOW_PATTERNS: Record<Exclude<CanonicalQuotaWindow, 'other'>, RegExp> = {
    'five-hour': /five|5.?hour|session/i,
    'weekly': /week/i,
    'monthly': /month/i,
};

export function activeProvider(providers: ProviderInstance[], activeId: string): ProviderInstance | null {
    const enabled = providers.filter(provider => provider.enabled);
    return enabled.find(provider => provider.id === activeId) ||
        enabled.find(provider => provider.showInPanel) || enabled[0] || null;
}

function highestWindow(windows: UsageWindow[]): UsageWindow | null {
    let highest: UsageWindow | null = null;
    for (const window of windows) {
        if ((window.percent ?? -1) > (highest?.percent ?? -1))
            highest = window;
    }
    return highest;
}

// The window the account's preference asks for, falling back to the most used one.
export function selectWindow(snapshot: Pick<ProviderSnapshot, 'windows'> | null, preference: QuotaWindowPreference): UsageWindow | null {
    const windows = snapshot?.windows ?? [];
    if (preference !== 'automatic') {
        const pattern = WINDOW_PATTERNS[preference];
        const selected = windows.find(window => window.canonicalWindow === preference) ??
            windows.find(window => pattern.test(`${window.id} ${window.label}`));
        if (selected)
            return selected;
    }
    return highestWindow(windows);
}

export function displayPercent(window: UsageWindow | null, mode: PanelPercentageMode): number | null {
    if (window?.percent == null)
        return null;
    const used = Math.max(0, Math.min(1, window.percent));
    return mode === 'remaining' ? 1 - used : used;
}

export function pressureClass(window: UsageWindow | null): 'neutral' | 'warning' | 'critical' {
    const used = window?.percent ?? 0;
    if (used >= 0.95)
        return 'critical';
    if (used >= 0.8)
        return 'warning';
    return 'neutral';
}

export function displayLabel(tr: Translator, window: UsageWindow | null, mode: PanelPercentageMode): string {
    const {_} = tr;
    const percent = displayPercent(window, mode);
    if (percent === null)
        return '—';
    const rounded = Math.round(percent * 100);
    return mode === 'remaining' ? formatText(_('%d%% left'), rounded) : formatText(_('%d%% used'), rounded);
}
