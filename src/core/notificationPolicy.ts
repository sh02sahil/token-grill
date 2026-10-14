import {selectWindow} from './display.js';
import {formatText, type Translator} from './i18n.js';
import {parseRecord, stringAt} from './json.js';
import {providerMetadata} from './providerMetadata.js';
import type {CanonicalQuotaWindow, PanelPercentageMode, ProviderInstance, ProviderSnapshot} from './types.js';

export interface NotificationCheckpoint {
    resetIdentity: string;
    lastNotifiedBucket: number;
    configuredStep: number;
}

// The header is the account's notification source title; the banner shows it above the title.
export interface NotificationText {
    header: string;
    title: string;
    body: string;
}

// Shown by the test notification when the account has no usage data yet.
const PREVIEW_CONSUMED = 0.34;
const PREVIEW_MILESTONE = 30;

// Milestone steps are multiples of 5 between 5 % and 50 %.
export function clampStep(stepPercent: number): number {
    return Math.max(5, Math.min(50, Math.round(stepPercent / 5) * 5));
}

export function notificationBucket(percent: number, stepPercent: number): number {
    const consumed = Math.max(0, Math.min(100, percent * 100));
    return Math.floor((consumed + 1e-6) / clampStep(stepPercent));
}

export function windowTitle(tr: Translator, canonical: CanonicalQuotaWindow, label: string): string {
    const {_} = tr;
    switch (canonical) {
    case 'five-hour':
        return _('Five-Hour Usage');
    case 'weekly':
        return _('Weekly Usage');
    case 'monthly':
        return _('Monthly Usage');
    default:
        return formatText(_('%s Usage'), label);
    }
}

function displayedPercent(consumed: number, mode: PanelPercentageMode): number {
    const clamped = Math.max(0, Math.min(1, consumed));
    return Math.round((mode === 'remaining' ? 1 - clamped : clamped) * 100);
}

export function notificationHeader(tr: Translator, accountName: string, consumed: number, mode: PanelPercentageMode): string {
    const {_} = tr;
    const percent = displayedPercent(consumed, mode);
    if (mode === 'remaining') {
        // Translators: the header of a usage alert; %d is a percentage, %s the account name.
        return formatText(_('%d%% remaining - %s | Token Grill'), percent, accountName);
    }
    // Translators: the header of a usage alert; %d is a percentage, %s the account name.
    return formatText(_('%d%% used - %s | Token Grill'), percent, accountName);
}

// Milestones are steps of usage; in remaining mode they are named by what is left.
function milestoneBody(tr: Translator, milestoneUsed: number, mode: PanelPercentageMode, test: boolean): string {
    const {_} = tr;
    if (mode === 'remaining') {
        const remaining = 100 - milestoneUsed;
        return test
            ? formatText(_('Test · crossed the %d%% remaining milestone'), remaining)
            : formatText(_('Crossed the %d%% remaining milestone'), remaining);
    }
    return test
        ? formatText(_('Test · crossed the %d%% used milestone'), milestoneUsed)
        : formatText(_('Crossed the %d%% used milestone'), milestoneUsed);
}

export function milestoneNotificationText(
    tr: Translator,
    instance: Pick<ProviderInstance, 'displayName'>,
    window: {canonicalWindow: CanonicalQuotaWindow; label: string},
    consumed: number,
    milestoneUsed: number,
    mode: PanelPercentageMode
): NotificationText {
    return {
        header: notificationHeader(tr, instance.displayName, consumed, mode),
        title: windowTitle(tr, window.canonicalWindow, window.label),
        body: milestoneBody(tr, milestoneUsed, mode, false),
    };
}

// The account's preferred window when nothing has been fetched yet.
function fallbackWindow(instance: Pick<ProviderInstance, 'kind' | 'panelWindowPreference'>): {canonicalWindow: CanonicalQuotaWindow; label: string} {
    const supported = providerMetadata(instance.kind).quotaWindows;
    const preferred = instance.panelWindowPreference;
    const canonicalWindow = preferred !== 'automatic' && supported.includes(preferred) ? preferred : supported[0] ?? 'other';
    return {canonicalWindow, label: ''};
}

// The current reading of the selected window and its last crossed milestone,
// so the preview looks like the alert the account would send.
export function testNotificationText(
    tr: Translator,
    instance: Pick<ProviderInstance, 'kind' | 'displayName' | 'panelWindowPreference'>,
    snapshot: Pick<ProviderSnapshot, 'windows'> | null,
    stepPercent: number,
    mode: PanelPercentageMode
): NotificationText {
    const selected = selectWindow(snapshot, instance.panelWindowPreference);
    const window = selected ?? fallbackWindow(instance);
    const step = clampStep(stepPercent);
    const consumed = selected?.percent ?? null;
    const milestone = consumed === null ? PREVIEW_MILESTONE : Math.max(1, notificationBucket(consumed, step)) * step;
    return {
        header: notificationHeader(tr, instance.displayName, consumed ?? PREVIEW_CONSUMED, mode),
        title: windowTitle(tr, window.canonicalWindow, window.label),
        body: milestoneBody(tr, milestone, mode, true),
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
