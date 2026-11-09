// What the top bar shows: one entry per service, holding the accounts the user
// ticked in the popup.  Pure, so the Shell code only draws the result.
import {selectWindow} from './display.js';
import type {
    AccentValue,
    Balance,
    CanonicalQuotaWindow,
    ProviderInstance,
    ProviderKind,
    ProviderSnapshot,
    TopBarSelection,
    UsageWindow,
} from './types.js';

export const BALANCE_KEY = 'balance';

const WINDOW_RANK: Record<CanonicalQuotaWindow, number> = {
    'five-hour': 0,
    'weekly': 1,
    'monthly': 2,
    'other': 3,
};

type WindowsOf = Pick<ProviderSnapshot, 'windows'> | null | undefined;

export interface TopBarAccount {
    id: string;
    accent: AccentValue;
    limits: UsageWindow[];
    balance: Balance | null;
    // Nothing to draw: the ticked limits are not in the latest reading.
    missing: boolean;
}

export interface TopBarGroup {
    kind: ProviderKind;
    accounts: TopBarAccount[];
}

export function limitKey(window: UsageWindow): string {
    return window.canonicalWindow === 'other' ? window.id : window.canonicalWindow;
}

// The popup's order: five-hour, weekly, monthly, then other limits as the service lists them.
export function orderedLimits(snapshot: WindowsOf): UsageWindow[] {
    return [...snapshot?.windows ?? []].sort((a, b) => WINDOW_RANK[a.canonicalWindow] - WINDOW_RANK[b.canonicalWindow]);
}

export function isShown(instance: Pick<ProviderInstance, 'topBar'>): boolean {
    return instance.topBar.automatic || instance.topBar.limits.length > 0;
}

export function shownLimits(instance: Pick<ProviderInstance, 'topBar'>, snapshot: WindowsOf): UsageWindow[] {
    if (instance.topBar.automatic) {
        const pressing = selectWindow(snapshot ?? null, 'automatic');
        return pressing ? [pressing] : [];
    }
    return orderedLimits(snapshot).filter(window => instance.topBar.limits.includes(limitKey(window)));
}

function inPopupOrder(keys: string[], snapshot: WindowsOf): string[] {
    const order = orderedLimits(snapshot).map(limitKey);
    const known = order.filter(key => keys.includes(key));
    return [...known, ...keys.filter(key => !order.includes(key))];
}

// The first click while automatic keeps what was showing, so nothing vanishes;
// clicking the limit automatic had chosen just pins it.
export function toggleLimit(instance: Pick<ProviderInstance, 'topBar'>, key: string, snapshot: WindowsOf): TopBarSelection {
    if (instance.topBar.automatic) {
        const [pressing] = shownLimits(instance, snapshot);
        const kept = pressing ? limitKey(pressing) : key;
        return {automatic: false, limits: inPopupOrder([...new Set([kept, key])], snapshot)};
    }
    const current = instance.topBar.limits;
    const limits = current.includes(key) ? current.filter(item => item !== key) : [...current, key];
    return {automatic: false, limits: inPopupOrder(limits, snapshot)};
}

export function setAutomatic(selection: TopBarSelection, on: boolean): TopBarSelection {
    return on ? {automatic: true, limits: []} : {automatic: false, limits: selection.limits};
}

export function topBarGroups(providers: ProviderInstance[], snapshots: Map<string, ProviderSnapshot>): TopBarGroup[] {
    const groups: TopBarGroup[] = [];
    for (const provider of providers) {
        if (!provider.enabled || !isShown(provider))
            continue;
        let group = groups.find(item => item.kind === provider.kind);
        if (!group) {
            group = {kind: provider.kind, accounts: []};
            groups.push(group);
        }
        const snapshot = snapshots.get(provider.id);
        const limits = shownLimits(provider, snapshot);
        const balance = provider.topBar.limits.includes(BALANCE_KEY) ? snapshot?.balance ?? null : null;
        group.accounts.push({id: provider.id, accent: provider.accent, limits, balance, missing: !limits.length && !balance});
    }
    return groups;
}
