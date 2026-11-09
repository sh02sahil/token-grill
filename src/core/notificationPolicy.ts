import {formatMoney} from './display.js';
import {formatText, type Translator} from './i18n.js';
import {parseRecord, stringAt} from './json.js';
import {providerMetadata} from './providerMetadata.js';
import {durationUntil, formatDuration} from './timeMath.js';
import {limitKey, orderedLimits, shownLimits} from './topBar.js';
import type {Balance, PanelPercentageMode, ProviderInstance, ProviderSnapshot, UsageWindow} from './types.js';

export interface NotificationCheckpoint {
    resetIdentity: string;
    lastNotifiedBucket: number;
    configuredStep: number;
}

// Read at a glance: the source names service and account, the title the limit and what is left.
export interface NotificationText {
    source: string;
    title: string;
    body: string;
}

// Shown by the test notification when the account has no usage data yet.
const PREVIEW_CONSUMED = 0.34;

// Milestone steps are multiples of 5 between 5 % and 50 %.
export function clampStep(stepPercent: number): number {
    return Math.max(5, Math.min(50, Math.round(stepPercent / 5) * 5));
}

export function notificationBucket(percent: number, stepPercent: number): number {
    const consumed = Math.max(0, Math.min(100, percent * 100));
    return Math.floor((consumed + 1e-6) / clampStep(stepPercent));
}

export function notificationKey(instanceId: string, window: Pick<UsageWindow, 'id' | 'canonicalWindow'>): string {
    return `${instanceId}:${limitKey(window)}`;
}

export function limitName(tr: Translator, window: Pick<UsageWindow, 'canonicalWindow' | 'label'>): string {
    const {_} = tr;
    switch (window.canonicalWindow) {
    case 'five-hour':
        return _('Five-hour');
    case 'weekly':
        return _('Weekly');
    case 'monthly':
        return _('Monthly');
    default:
        return window.label;
    }
}

function sourceTitle(tr: Translator, serviceLabel: string, accountName: string): string {
    // Translators: a notification source; the service, then the account name.
    return formatText(tr._('%s · %s'), serviceLabel, accountName);
}

function readingTitle(tr: Translator, window: Pick<UsageWindow, 'canonicalWindow' | 'label'>, consumed: number, mode: PanelPercentageMode): string {
    const {_} = tr;
    const clamped = Math.max(0, Math.min(1, consumed));
    const name = limitName(tr, window);
    if (mode === 'remaining')
        return formatText(_('%s: %d%% left'), name, Math.round((1 - clamped) * 100));
    return formatText(_('%s: %d%% used'), name, Math.round(clamped * 100));
}

function resetText(tr: Translator, resetAt: number | null, now: number): string {
    const {_} = tr;
    const parts = durationUntil(resetAt, now);
    if (!parts)
        return _('Reset time unknown');
    if (parts.expired || parts.totalMinutes < 1)
        return _('Resets now');
    return formatText(_('Resets in %s'), formatDuration(tr, parts, true));
}

export function limitNotificationText(
    tr: Translator,
    serviceLabel: string,
    instance: Pick<ProviderInstance, 'displayName'>,
    window: Pick<UsageWindow, 'canonicalWindow' | 'label' | 'resetAt'>,
    consumed: number,
    mode: PanelPercentageMode,
    now: number
): NotificationText {
    return {
        source: sourceTitle(tr, serviceLabel, instance.displayName),
        title: readingTitle(tr, window, consumed, mode),
        body: resetText(tr, window.resetAt, now),
    };
}

export function balanceNotificationText(
    tr: Translator,
    serviceLabel: string,
    instance: Pick<ProviderInstance, 'displayName' | 'lowBalance'>,
    balance: Balance
): NotificationText {
    const {_} = tr;
    return {
        source: sourceTitle(tr, serviceLabel, instance.displayName),
        title: formatText(_('Balance: %s left'), formatMoney(balance, 2)),
        body: formatText(_('Below your %s warning'), formatMoney({amount: instance.lowBalance ?? 0, currency: balance.currency}, 2)),
    };
}

// The account's first top-bar limit as it reads now, so the preview looks like a real alert.
export function testNotificationText(
    tr: Translator,
    serviceLabel: string,
    instance: Pick<ProviderInstance, 'kind' | 'displayName' | 'topBar'>,
    snapshot: Pick<ProviderSnapshot, 'windows'> | null,
    mode: PanelPercentageMode,
    now: number
): NotificationText {
    const {_} = tr;
    const window = shownLimits(instance, snapshot)[0] ?? orderedLimits(snapshot)[0] ?? null;
    const preview = {canonicalWindow: providerMetadata(instance.kind).quotaWindows[0] ?? 'other', label: '', resetAt: null};
    const consumed = window?.percent ?? PREVIEW_CONSUMED;
    return {
        source: sourceTitle(tr, serviceLabel, instance.displayName),
        title: readingTitle(tr, window ?? preview, consumed, mode),
        body: formatText(_('Test notification · %s'), resetText(tr, window?.resetAt ?? null, now)),
    };
}

export function parseTestNotificationRequest(value: string): {providerId: string; nonce: string} | null {
    const request = parseRecord(value);
    const providerId = request ? stringAt(request, 'providerId') : null;
    const nonce = request ? stringAt(request, 'nonce') : null;
    if (!providerId || !nonce || providerId.length > 256 || nonce.length > 256)
        return null;
    return {providerId, nonce};
}

export function shouldNotifyMilestone(
    previous: NotificationCheckpoint | null,
    resetIdentity: string,
    bucket: number,
    stepPercent: number
): boolean {
    // Startup, a newly selected quota window, and a changed notification step
    // seed state silently. Alerts represent crossings observed by Token Grill,
    // not historical milestones replayed when an account is first loaded.
    if (!previous || previous.resetIdentity !== resetIdentity || previous.configuredStep !== stepPercent)
        return false;
    return bucket >= 1 && bucket > previous.lastNotifiedBucket;
}
