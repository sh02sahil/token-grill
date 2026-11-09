import {CollectorError, NO_USAGE} from '../../core/errors.js';
import type {ProviderInstance, ProviderSnapshot} from '../../core/types.js';
import {BaseCollector, type CollectorContext, type LimitsUpdate} from '../base.js';
import {loadOpenCodeGoKey} from './auth.js';
import {normalizeOpenCodeGoUsage} from './normalize.js';

const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

async function fetchLimits(context: CollectorContext): Promise<LimitsUpdate> {
    const key = await loadOpenCodeGoKey(context.cancellable);
    let payload: unknown;
    try {
        payload = await context.requestJson('GET', USAGE_URL, {'Accept': 'application/json', 'Authorization': `Bearer ${key}`});
    } catch (error) {
        // A valid Zen key without a Go subscription is refused with 403.
        if (error instanceof CollectorError && error.status === 403)
            throw new CollectorError('unsupported-account', ({_}) => _('This OpenCode key has no Go subscription.'));
        throw error;
    }
    const windows = normalizeOpenCodeGoUsage(payload);
    if (!windows.length)
        throw new CollectorError('response-shape', NO_USAGE);
    return {windows};
}

export class OpenCodeGoCollector extends BaseCollector {
    collect(instance: ProviderInstance, context: CollectorContext, snapshot: ProviderSnapshot): Promise<ProviderSnapshot> {
        if (!instance.liveUsageEnabled)
            return Promise.resolve(snapshot);
        return this.collectLimits(context, snapshot, () => fetchLimits(context));
    }
}
