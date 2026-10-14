import {numberAt, parseRecord, recordAt, stringAt} from '../../core/json.js';
import type {UsageEvent} from '../../core/types.js';

// Claude Code writes one JSON record per line; only assistant messages carry usage.
export function claudeUsageEvent(line: string): UsageEvent | null {
    // Most lines carry no usage, so they are skipped before the costlier JSON parse.
    if (!line.includes('"usage"'))
        return null;
    const record = parseRecord(line);
    if (!record)
        return null;
    const message = recordAt(record, 'message');
    const usage = message ? recordAt(message, 'usage') : null;
    const capturedAt = Date.parse(stringAt(record, 'timestamp') ?? '');
    if (!message || !usage || !Number.isFinite(capturedAt))
        return null;
    const input = numberAt(usage, 'input_tokens') ?? 0;
    const output = numberAt(usage, 'output_tokens') ?? 0;
    const total = input + output;
    if (!total)
        return null;
    return {
        capturedAt,
        model: stringAt(message, 'model'),
        totals: {
            input,
            output,
            cachedInput: numberAt(usage, 'cache_read_input_tokens') ?? 0,
            cacheWrite: numberAt(usage, 'cache_creation_input_tokens') ?? 0,
            reasoning: 0,
            total,
        },
    };
}
