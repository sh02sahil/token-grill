import type Gio from 'gi://Gio';

import {EMPTY_TOTALS, type AggregateBucket, type TokenTotals, type UsageEvent} from '../core/types.js';
import {costFor} from '../pricing/calculator.js';
import type {PricingCatalog} from '../pricing/catalog.js';
import {dataPath, readJson, SerialWriter, type WarningLogger} from './atomicJson.js';

interface AggregateFile {
    schemaVersion: 1;
    buckets: AggregateBucket[];
}

function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
    return {
        input: a.input + b.input,
        output: a.output + b.output,
        cachedInput: a.cachedInput + b.cachedInput,
        cacheWrite: a.cacheWrite + b.cacheWrite,
        reasoning: a.reasoning + b.reasoning,
        total: a.total + b.total,
    };
}

function bucketKey(providerId: string, date: string, model: string): string {
    return JSON.stringify([providerId, date, model]);
}

function bucketStartMs(bucket: AggregateBucket): number {
    return Date.parse(`${bucket.date}T00:00:00Z`);
}

// Daily token totals per account and model, kept so history files are only read once.
export class AggregateStore {
    private readonly _writer = new SerialWriter(dataPath('history-v1.json'));
    private readonly _buckets = new Map<string, AggregateBucket>();

    private readonly _logger: WarningLogger;

    constructor(logger: WarningLogger) {
        this._logger = logger;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        const file = await readJson<AggregateFile>(this._writer.path, {schemaVersion: 1, buckets: []}, cancellable, this._logger);
        // The file is ours, but a damaged one must not stop the extension from starting.
        for (const {providerId, date, model, totals} of Array.isArray(file.buckets) ? file.buckets : [])
            this._buckets.set(bucketKey(providerId, date, model), {providerId, date, model, totals});
    }

    add(providerId: string, event: UsageEvent): void {
        const date = new Date(event.capturedAt).toISOString().slice(0, 10);
        const model = event.model ?? 'unknown';
        const key = bucketKey(providerId, date, model);
        const bucket = this._buckets.get(key) ?? {providerId, date, model, totals: EMPTY_TOTALS};
        this._buckets.set(key, {...bucket, totals: addTotals(bucket.totals, event.totals)});
        this._writer.markDirty();
    }

    totals(providerId: string, sinceMs: number): TokenTotals {
        let sum = EMPTY_TOTALS;
        for (const bucket of this._bucketsSince(providerId, sinceMs))
            sum = addTotals(sum, bucket.totals);
        return sum;
    }

    // Null when no model in the range has a known price.
    cost(providerId: string, sinceMs: number, catalog: PricingCatalog): number | null {
        let total: number | null = null;
        for (const bucket of this._bucketsSince(providerId, sinceMs)) {
            const rate = catalog[bucket.model];
            if (rate)
                total = (total ?? 0) + costFor(bucket.totals, rate);
        }
        return total;
    }

    removeProvider(providerId: string): Promise<void> {
        for (const [key, bucket] of this._buckets) {
            if (bucket.providerId === providerId)
                this._buckets.delete(key);
        }
        this._writer.markDirty();
        return this.flush();
    }

    flush(): Promise<void> {
        return this._writer.flush(() => ({schemaVersion: 1, buckets: [...this._buckets.values()]}));
    }

    private _bucketsSince(providerId: string, sinceMs: number): AggregateBucket[] {
        return [...this._buckets.values()].filter(bucket => bucket.providerId === providerId && bucketStartMs(bucket) >= sinceMs);
    }
}
