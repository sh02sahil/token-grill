import type {CanonicalQuotaWindow} from '../core/types.js';

// Labels are data, matched by the window preference and shown only for
// windows outside the three canonical ones; the UI names those itself.
const LABELS: Record<Exclude<CanonicalQuotaWindow, 'other'>, string> = {
    'five-hour': 'Five-hour',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
};

export function windowLabel(canonicalWindow: CanonicalQuotaWindow, fallback: string): string {
    return canonicalWindow === 'other' ? fallback : LABELS[canonicalWindow];
}
