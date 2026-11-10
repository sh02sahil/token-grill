import type Gio from 'gi://Gio';

import {redact, type DiagnosticEntry} from '../core/diagnostics.js';
import {isRecord} from '../core/json.js';
import {readJson, SerialWriter, statePath, type WarningLogger} from './atomicJson.js';

const MAX_ENTRIES = 200;

export const DIAGNOSTICS_FILE = 'diagnostics-v1.json';

interface DiagnosticsFile {
    schemaVersion: 1;
    entries: DiagnosticEntry[];
}

function isEntry(value: unknown): value is DiagnosticEntry {
    return isRecord(value) && typeof value.at === 'number' && typeof value.account === 'string' &&
        typeof value.kind === 'string' && typeof value.app === 'string' &&
        typeof value.step === 'string' && typeof value.detail === 'string';
}

export async function readDiagnostics(cancellable: Gio.Cancellable, logger: WarningLogger): Promise<DiagnosticEntry[]> {
    const file = await readJson<Partial<DiagnosticsFile>>(statePath(DIAGNOSTICS_FILE), {}, cancellable, logger);
    return Array.isArray(file.entries) ? file.entries.filter(isEntry) : [];
}

// The last refresh steps, redacted before they are kept, so the file never holds a secret.
export class DiagnosticsStore {
    private readonly _writer = new SerialWriter(statePath(DIAGNOSTICS_FILE));
    private readonly _logger: WarningLogger;
    private readonly _home: string;
    private _entries: DiagnosticEntry[] = [];

    constructor(logger: WarningLogger, home: string) {
        this._logger = logger;
        this._home = home;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        this._entries = [...await readDiagnostics(cancellable, this._logger), ...this._entries].slice(-MAX_ENTRIES);
    }

    record(entry: DiagnosticEntry): DiagnosticEntry {
        const kept = {...entry, detail: redact(entry.detail, this._home)};
        this._entries.push(kept);
        if (this._entries.length > MAX_ENTRIES)
            this._entries.splice(0, this._entries.length - MAX_ENTRIES);
        this._writer.markDirty();
        return kept;
    }

    flush(): Promise<void> {
        return this._writer.flush(() => ({schemaVersion: 1, entries: this._entries}));
    }
}
