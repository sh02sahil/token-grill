import type Gio from 'gi://Gio';

import type {BalanceReference} from '../core/balanceMeter.js';
import {isRecord} from '../core/json.js';
import {readJson, SerialWriter, statePath, type WarningLogger} from './atomicJson.js';

interface BalanceFile {
    schemaVersion: 1;
    accounts: Record<string, BalanceReference>;
}

function isReference(value: unknown): value is BalanceReference {
    return isRecord(value) && typeof value.currency === 'string' &&
        typeof value.full === 'number' && Number.isFinite(value.full) &&
        typeof value.last === 'number' && Number.isFinite(value.last);
}

// The full amount of each prepaid account, kept across restarts so a meter does not reset to 100 % on login.
export class BalanceStore {
    private readonly _writer = new SerialWriter(statePath('balances-v1.json'));
    private readonly _accounts = new Map<string, BalanceReference>();
    private readonly _logger: WarningLogger;

    constructor(logger: WarningLogger) {
        this._logger = logger;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        const file = await readJson<Partial<BalanceFile>>(this._writer.path, {}, cancellable, this._logger);
        for (const [id, reference] of Object.entries(isRecord(file.accounts) ? file.accounts : {})) {
            if (isReference(reference))
                this._accounts.set(id, reference);
        }
    }

    get(providerId: string): BalanceReference | null {
        return this._accounts.get(providerId) ?? null;
    }

    set(providerId: string, reference: BalanceReference): void {
        this._accounts.set(providerId, reference);
        this._writer.markDirty();
    }

    removeProvider(providerId: string): Promise<void> {
        this._accounts.delete(providerId);
        this._writer.markDirty();
        return this.flush();
    }

    flush(): Promise<void> {
        return this._writer.flush(() => ({schemaVersion: 1, accounts: Object.fromEntries(this._accounts)}));
    }
}
