// Tells when one plan is signed into two apps, so adding it twice can be flagged.
import {recordAt, stringAt} from '../core/json.js';
import type {ProviderKind} from '../core/types.js';
import type {OpenCodeEntry} from './opencode/entries.js';

export interface AccountIdentity {
    kind: ProviderKind;
    key: string;
}

export function identityFromCodexAuth(payload: Record<string, unknown>): AccountIdentity | null {
    const tokens = recordAt(payload, 'tokens');
    const key = tokens ? stringAt(tokens, 'account_id') : null;
    return key ? {kind: 'codex', key} : null;
}

export function identityFromOpenCode(id: string, entry: OpenCodeEntry): AccountIdentity | null {
    if (id === 'openai' && entry.type === 'oauth' && entry.accountId)
        return {kind: 'codex', key: entry.accountId};
    return null;
}

// The id of an existing account on the same plan, or null when unknown.
export function duplicateOf(candidate: AccountIdentity | null, existing: Map<string, AccountIdentity | null>): string | null {
    if (!candidate)
        return null;
    for (const [id, identity] of existing) {
        if (identity?.kind === candidate.kind && identity.key === candidate.key)
            return id;
    }
    return null;
}
