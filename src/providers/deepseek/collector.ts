import type {ProviderInstance, ProviderSnapshot} from '../../core/types.js';
import {BaseCollector, type CollectorContext, type LimitsUpdate} from '../base.js';
import {loadDeepSeekKey} from './auth.js';
import {normalizeDeepSeekBalance} from './normalize.js';

const BALANCE_URL = 'https://api.deepseek.com/user/balance';

async function fetchBalance(instance: ProviderInstance, context: CollectorContext): Promise<LimitsUpdate> {
    const key = await loadDeepSeekKey(instance, context.cancellable);
    const payload = await context.requestJson('GET', BALANCE_URL, {'Accept': 'application/json', 'Authorization': `Bearer ${key}`});
    return {balance: normalizeDeepSeekBalance(payload), windows: []};
}

export class DeepSeekCollector extends BaseCollector {
    collect(instance: ProviderInstance, context: CollectorContext, snapshot: ProviderSnapshot): Promise<ProviderSnapshot> {
        if (!instance.liveUsageEnabled)
            return Promise.resolve(snapshot);
        return this.collectLimits(context, snapshot, () => fetchBalance(instance, context));
    }
}
