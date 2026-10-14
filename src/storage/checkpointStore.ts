import type Gio from 'gi://Gio';

import type {FileCheckpoint} from '../core/types.js';
import {readJson, SerialWriter, statePath, type WarningLogger} from './atomicJson.js';

interface CheckpointFile {
    schemaVersion: 1;
    files: FileCheckpoint[];
}

function checkpointKey(providerId: string, path: string): string {
    return JSON.stringify([providerId, path]);
}

// How far each history file has been read, so the next pass continues from there.
export class CheckpointStore {
    private readonly _writer = new SerialWriter(statePath('checkpoints-v1.json'));
    private readonly _files = new Map<string, FileCheckpoint>();

    private readonly _logger: WarningLogger;

    constructor(logger: WarningLogger) {
        this._logger = logger;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        const file = await readJson<CheckpointFile>(this._writer.path, {schemaVersion: 1, files: []}, cancellable, this._logger);
        for (const checkpoint of Array.isArray(file.files) ? file.files : [])
            this._files.set(checkpointKey(checkpoint.providerId, checkpoint.path), checkpoint);
    }

    get(providerId: string, path: string): FileCheckpoint | null {
        return this._files.get(checkpointKey(providerId, path)) ?? null;
    }

    set(checkpoint: FileCheckpoint): void {
        this._files.set(checkpointKey(checkpoint.providerId, checkpoint.path), checkpoint);
        this._writer.markDirty();
    }

    removeProvider(providerId: string): Promise<void> {
        for (const [key, checkpoint] of this._files) {
            if (checkpoint.providerId === providerId)
                this._files.delete(key);
        }
        this._writer.markDirty();
        return this.flush();
    }

    flush(): Promise<void> {
        return this._writer.flush(() => ({schemaVersion: 1, files: [...this._files.values()]}));
    }
}
