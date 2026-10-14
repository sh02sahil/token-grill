import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {normalizeAccent} from './accent.js';
import {expandPath} from './paths.js';
import {PROVIDER_METADATA, providerMetadata} from './providerMetadata.js';
import {orderedProviders} from './providerOrder.js';
import type {ProviderInstance, ProviderKind, QuotaWindowPreference} from './types.js';

export const CONFIGURATION_VERSION = 2;
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

// A malformed legacy value is left untouched so it can still be recovered by hand;
// migrating it would silently drop the entries that fail to normalize.
export function migrateProviderSettings(settings: Gio.Settings): void {
    const stored = parseStoredProviders(settings);
    const outdated = settings.get_uint('configuration-version') < CONFIGURATION_VERSION || stored.some(isLegacyEntry);
    if (!outdated)
        return;
    const providers = stored.flatMap(item => normalizeProvider(item));
    if (providers.length === stored.length)
        writeProviders(settings, providers);
}

export function newProvider(kind: ProviderKind, accountHome: string): ProviderInstance {
    const metadata = providerMetadata(kind);
    return {
        schemaVersion: CONFIGURATION_VERSION,
        id: GLib.uuid_string_random(),
        kind,
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

function isProviderKind(value: unknown): value is ProviderKind {
    return typeof value === 'string' && Object.hasOwn(PROVIDER_METADATA, value);
}

export function normalizeProvider(value: unknown): ProviderInstance[] {
    if (!value || typeof value !== 'object')
        return [];
    const item = value as Record<string, unknown>;
    if (item.schemaVersion !== 1 && item.schemaVersion !== CONFIGURATION_VERSION)
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
        schemaVersion: CONFIGURATION_VERSION,
        id: item.id,
        kind: item.kind,
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
    }];
}
