import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {normalizeAccent} from './accent.js';
import {activeProvider} from './display.js';
import {expandPath} from './paths.js';
import {PROVIDER_METADATA, providerMetadata} from './providerMetadata.js';
import {orderedProviders} from './providerOrder.js';
import type {AccountApp, ProviderInstance, ProviderKind, QuotaWindowPreference, TopBarSelection} from './types.js';

// The settings layout version; the entries themselves keep format 2 so 0.3.x can still read them.
export const CONFIGURATION_VERSION = 3;
export const ENTRY_SCHEMA_VERSION = 2;
const MAX_LIMIT_KEY_LENGTH = 64;
export const QUOTA_WINDOW_PREFERENCES: QuotaWindowPreference[] = ['automatic', 'five-hour', 'weekly', 'monthly'];

function parseStoredProviders(settings: Gio.Settings): unknown[] {
    try {
        const parsed: unknown = JSON.parse(settings.get_string('provider-instances-json'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function isLegacyEntry(item: unknown): boolean {
    return Boolean(item && typeof item === 'object' && (item as Record<string, unknown>).schemaVersion === 1);
}

export function readProviders(settings: Gio.Settings): ProviderInstance[] {
    return orderedProviders(parseStoredProviders(settings).flatMap(item => normalizeProvider(item)));
}

export function writeProviders(settings: Gio.Settings, providers: ProviderInstance[]): void {
    settings.set_string('provider-instances-json', JSON.stringify(providers));
    settings.set_uint('configuration-version', CONFIGURATION_VERSION);
}

// Before 0.4.0 the top bar showed one account, the active one, with its
// preferred limit; that account keeps that look and the others start hidden.
function legacyTopBar(item: ProviderInstance, activeId: string | null): TopBarSelection {
    if (item.id !== activeId)
        return {automatic: false, limits: []};
    if (item.panelWindowPreference === 'automatic')
        return {automatic: true, limits: []};
    return {automatic: false, limits: [item.panelWindowPreference]};
}

// A malformed legacy value is left untouched so it can still be recovered by hand;
// migrating it would silently drop the entries that fail to normalize.
export function migrateProviderSettings(settings: Gio.Settings): void {
    const stored = parseStoredProviders(settings);
    const version = settings.get_uint('configuration-version');
    const outdated = version < CONFIGURATION_VERSION || stored.some(isLegacyEntry);
    if (!outdated)
        return;
    let providers = stored.flatMap(item => normalizeProvider(item));
    if (providers.length !== stored.length)
        return;
    if (version < CONFIGURATION_VERSION) {
        const activeId = activeProvider(providers, settings.get_string('active-provider-id'))?.id ?? null;
        providers = providers.map((provider, index) => hasTopBar(stored[index])
            ? provider
            : {...provider, topBar: legacyTopBar(provider, activeId)});
    }
    writeProviders(settings, providers);
}

export function newProvider(kind: ProviderKind, app: AccountApp, accountHome: string): ProviderInstance {
    const metadata = providerMetadata(kind);
    return {
        schemaVersion: ENTRY_SCHEMA_VERSION,
        id: GLib.uuid_string_random(),
        kind,
        app,
        displayName: metadata.label,
        accent: metadata.defaultAccent,
        enabled: true,
        showInPanel: true,
        sortOrder: 0,
        accountHome,
        authFileOverride: null,
        sessionsDirectoryOverride: null,
        liveUsageEnabled: true,
        localHistoryEnabled: false,
        panelWindowPreference: metadata.defaultQuotaWindow,
        topBar: {automatic: true, limits: []},
        lowBalance: null,
    };
}

function isValidPath(value: string): boolean {
    try {
        expandPath(value);
        return true;
    } catch {
        return false;
    }
}

function optionalPath(value: unknown): string | null {
    return typeof value === 'string' && value && isValidPath(value) ? value : null;
}

function hasTopBar(value: unknown): boolean {
    return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).topBar);
}

function normalizeTopBar(value: unknown): TopBarSelection {
    if (!value || typeof value !== 'object')
        return {automatic: false, limits: []};
    const item = value as Record<string, unknown>;
    const keys = Array.isArray(item.limits) ? item.limits : [];
    const limits = keys.filter((key): key is string => typeof key === 'string' && key.length > 0 && key.length <= MAX_LIMIT_KEY_LENGTH);
    return {automatic: item.automatic === true, limits: [...new Set(limits)]};
}

function normalizeApp(value: unknown, supported: readonly [AccountApp, ...AccountApp[]]): AccountApp {
    return supported.find(app => app === value) ?? supported[0];
}

function isProviderKind(value: unknown): value is ProviderKind {
    return typeof value === 'string' && Object.hasOwn(PROVIDER_METADATA, value);
}

export function normalizeProvider(value: unknown): ProviderInstance[] {
    if (!value || typeof value !== 'object')
        return [];
    const item = value as Record<string, unknown>;
    if (item.schemaVersion !== 1 && item.schemaVersion !== ENTRY_SCHEMA_VERSION)
        return [];
    if (typeof item.id !== 'string' || !isProviderKind(item.kind))
        return [];
    if (typeof item.accountHome !== 'string' || !isValidPath(item.accountHome))
        return [];

    const metadata = providerMetadata(item.kind);
    const storedWindow = item.panelWindowPreference as QuotaWindowPreference;
    let panelWindowPreference = QUOTA_WINDOW_PREFERENCES.includes(storedWindow) ? storedWindow : metadata.defaultQuotaWindow;
    if (metadata.quotaWindows.length === 1 && panelWindowPreference !== metadata.quotaWindows[0])
        panelWindowPreference = metadata.defaultQuotaWindow;
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';

    return [{
        schemaVersion: ENTRY_SCHEMA_VERSION,
        id: item.id,
        kind: item.kind,
        app: normalizeApp(item.app, metadata.apps),
        displayName: displayName || metadata.label,
        accent: normalizeAccent(item.accent, metadata.defaultAccent),
        enabled: item.enabled !== false,
        showInPanel: item.showInPanel !== false,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
        accountHome: item.accountHome,
        authFileOverride: optionalPath(item.authFileOverride),
        sessionsDirectoryOverride: optionalPath(item.sessionsDirectoryOverride),
        liveUsageEnabled: item.liveUsageEnabled !== false,
        localHistoryEnabled: metadata.localHistorySupported && item.localHistoryEnabled === true,
        panelWindowPreference,
        topBar: normalizeTopBar(item.topBar),
        lowBalance: typeof item.lowBalance === 'number' && Number.isFinite(item.lowBalance) && item.lowBalance >= 0 ? item.lowBalance : null,
    }];
}
