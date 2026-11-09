import {CollectorError, NO_USAGE} from '../../core/errors.js';
import type {ProviderInstance, ProviderSnapshot} from '../../core/types.js';
import {BaseCollector, type CollectorContext, type LimitsUpdate} from '../base.js';
import {loadKimiAuth} from './auth.js';
import {normalizeKimiUsage} from './normalize.js';

async function fetchLimits(instance: ProviderInstance, context: CollectorContext): Promise<LimitsUpdate> {
    const {token, host} = await loadKimiAuth(instance, context.cancellable);
    const payload = await context.requestJson('GET', `https://${host}/coding/v1/usages`, {'Accept': 'application/json', 'Authorization': `Bearer ${token}`});
    const windows = normalizeKimiUsage(payload);
    if (!windows.length)
        throw new CollectorError('response-shape', NO_USAGE);
    return {windows};
}

export class KimiCollector extends BaseCollector {
    collect(instance: ProviderInstance, context: CollectorContext, snapshot: ProviderSnapshot): Promise<ProviderSnapshot> {
        if (!instance.liveUsageEnabled)
            return Promise.resolve(snapshot);
        return this.collectLimits(context, snapshot, () => fetchLimits(instance, context));
    }
}
