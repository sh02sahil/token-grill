import {numberAt, parseRecord, recordAt, stringAt} from '../../core/json.js';
import type {UsageEvent} from '../../core/types.js';

// Codex records the usage of each model turn in a `token_count` event. The
// event names no model, so these totals are not priced.
export function codexUsageEvent(line: string): UsageEvent | null {
    // Most lines are messages and tool calls, so they are skipped before the costlier JSON parse.
    if (!line.includes('"token_count"'))
        return null;
    const record = parseRecord(line);
    const payload = record ? recordAt(record, 'payload') : null;
    if (!record || record.type !== 'event_msg' || !payload || payload.type !== 'token_count')
        return null;
    const info = recordAt(payload, 'info');
    const usage = info ? recordAt(info, 'last_token_usage') : null;
    const capturedAt = Date.parse(stringAt(record, 'timestamp') ?? '');
    if (!usage || !Number.isFinite(capturedAt))
        return null;
    const input = numberAt(usage, 'input_tokens') ?? 0;
    const output = numberAt(usage, 'output_tokens') ?? 0;
    const total = numberAt(usage, 'total_tokens') ?? input + output;
    if (!total)
        return null;
    return {
        capturedAt,
        model: null,
        totals: {
            input,
            output,
            cachedInput: numberAt(usage, 'cached_input_tokens') ?? 0,
            cacheWrite: 0,
            reasoning: numberAt(usage, 'reasoning_output_tokens') ?? 0,
            total,
        },
    };
}
