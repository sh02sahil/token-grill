import type Gio from 'gi://Gio';

import {redact, type DiagnosticEntry, type ReportHeader} from '../core/diagnostics.js';
import {isRecord} from '../core/json.js';
import {readJson, SerialWriter, statePath, type WarningLogger} from './atomicJson.js';

const MAX_ENTRIES = 200;

export const DIAGNOSTICS_FILE = 'diagnostics-v1.json';

// The versions are written by the Shell, which knows its own version; the preferences only read them.
export type DiagnosticsAbout = Omit<ReportHeader, 'date'>;

interface DiagnosticsFile {
    schemaVersion: 1;
    about: DiagnosticsAbout;
    entries: DiagnosticEntry[];
}

export interface Diagnostics {
    about: DiagnosticsAbout | null;
    entries: DiagnosticEntry[];
}

function isEntry(value: unknown): value is DiagnosticEntry {
    return isRecord(value) && typeof value.at === 'number' && typeof value.account === 'string' &&
        typeof value.kind === 'string' && typeof value.app === 'string' &&
        typeof value.step === 'string' && typeof value.detail === 'string';
}

function isAbout(value: unknown): value is DiagnosticsAbout {
    return isRecord(value) && typeof value.version === 'string' && typeof value.shell === 'string';
}

export async function readDiagnostics(cancellable: Gio.Cancellable, logger: WarningLogger): Promise<Diagnostics> {
    const file = await readJson<Partial<DiagnosticsFile>>(statePath(DIAGNOSTICS_FILE), {}, cancellable, logger);
    return {
        about: isAbout(file.about) ? file.about : null,
        entries: Array.isArray(file.entries) ? file.entries.filter(isEntry) : [],
    };
}

// The last refresh steps, redacted before they are kept, so the file never holds a secret.
export class DiagnosticsStore {
    private readonly _writer = new SerialWriter(statePath(DIAGNOSTICS_FILE));
    private readonly _logger: WarningLogger;
    private readonly _home: string;
    private readonly _about: DiagnosticsAbout;
    private _entries: DiagnosticEntry[] = [];

    constructor(logger: WarningLogger, home: string, about: DiagnosticsAbout) {
        this._logger = logger;
        this._home = home;
        this._about = about;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        const {entries} = await readDiagnostics(cancellable, this._logger);
        this._entries = [...entries, ...this._entries].slice(-MAX_ENTRIES);
        // A new version or Shell is worth recording even before the next request.
        this._writer.markDirty();
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
        return this._writer.flush(() => ({schemaVersion: 1, about: this._about, entries: this._entries}));
    }
}
