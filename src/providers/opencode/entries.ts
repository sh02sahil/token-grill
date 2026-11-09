// OpenCode keeps every sign-in in one auth.json, keyed by its provider id.
// Field names are the ones OpenCode writes: type, access, refresh, expires, accountId, key.
import {isRecord, numberAt, stringAt} from '../../core/json.js';
import type {ProviderKind} from '../../core/types.js';

export type OpenCodeEntry =
    | {type: 'oauth'; access: string; refresh: string | null; expires: number | null; accountId: string | null}
    | {type: 'api'; key: string};

export type OpenCodeMatch =
    | {status: 'service'; kind: ProviderKind}
    | {status: 'uses-other-app'; kind: ProviderKind}
    | {status: 'nothing-to-track'};

// OpenCode provider ids whose sign-in reaches a service Token Grill tracks.
const OPENCODE_SERVICES: Record<string, {kind: ProviderKind; entry: OpenCodeEntry['type']}> = {
    openai: {kind: 'codex', entry: 'oauth'},
    anthropic: {kind: 'claude', entry: 'oauth'},
};

// OpenCode's Kiro plugin uses kiro-cli's own sign-in, so the account is added from the Kiro app.
const SHARED_SIGN_INS: Record<string, ProviderKind> = {
    kiro: 'kiro',
};

function parseEntry(value: unknown): OpenCodeEntry | null {
    if (!isRecord(value))
        return null;
    const type = stringAt(value, 'type');
    if (type === 'api') {
        const key = stringAt(value, 'key');
        return key ? {type, key} : null;
    }
    if (type !== 'oauth')
        return null;
    const access = stringAt(value, 'access');
    if (!access)
        return null;
    return {type, access, refresh: stringAt(value, 'refresh'), expires: numberAt(value, 'expires'), accountId: stringAt(value, 'accountId')};
}

export function parseOpenCodeAuth(payload: Record<string, unknown>): Map<string, OpenCodeEntry> {
    const entries = new Map<string, OpenCodeEntry>();
    for (const [id, value] of Object.entries(payload)) {
        const entry = parseEntry(value);
        if (entry)
            entries.set(id, entry);
    }
    return entries;
}

export function matchOpenCodeEntry(id: string, entry: OpenCodeEntry): OpenCodeMatch {
    const shared = SHARED_SIGN_INS[id];
    if (shared)
        return {status: 'uses-other-app', kind: shared};
    const service = OPENCODE_SERVICES[id];
    if (service && service.entry === entry.type)
        return {status: 'service', kind: service.kind};
    return {status: 'nothing-to-track'};
}
