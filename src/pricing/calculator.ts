import type {TokenTotals} from '../core/types.js';
import type {ModelRate} from './catalog.js';

// Rates are per million tokens; cache rates default to the input rate.
export function costFor(totals: TokenTotals, rate: ModelRate): number {
    const input = totals.input * rate.input;
    const output = totals.output * rate.output;
    const cachedInput = totals.cachedInput * (rate.cachedInput ?? rate.input);
    const cacheWrite = totals.cacheWrite * (rate.cacheWrite ?? rate.input);
    return (input + output + cachedInput + cacheWrite) / 1_000_000;
}
