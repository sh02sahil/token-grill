import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {isIoError} from '../core/gio.js';
import {providerPaths} from '../core/paths.js';
import type {ProviderInstance, UsageEvent} from '../core/types.js';
import type {AggregateStore} from '../storage/aggregateStore.js';
import type {CheckpointStore} from '../storage/checkpointStore.js';
import {scanJsonl} from '../storage/jsonl.js';

// Totals are cumulative, so changing this re-reads every file and counts it again.
const PARSER_VERSION = 1;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const FILE_ATTRIBUTES = 'standard::name,standard::type,standard::size,time::modified';
const BATCH_SIZE = 100;

interface HistoryFile {
    file: Gio.File;
    path: string;
    size: number;
    mtime: number;
}

async function listChildren(directory: Gio.File, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[]> {
    let enumerator: Gio.FileEnumerator;
    try {
        enumerator = await directory.enumerate_children_async(FILE_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
    } catch (error) {
        // A tool that was never used has no history directory, and sessions can be removed while they are listed.
        if (isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
            return [];
        throw error;
    }
    const children: Gio.FileInfo[] = [];
    try {
        for (;;) {
            // eslint-disable-next-line no-await-in-loop -- an enumerator hands out its batches one after another
            const batch = await enumerator.next_files_async(BATCH_SIZE, GLib.PRIORITY_DEFAULT, cancellable);
            if (!batch.length)
                break;
            children.push(...batch);
        }
    } finally {
        await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
    }
    return children;
}

async function findHistoryFiles(directory: Gio.File, cutoff: number, cancellable: Gio.Cancellable): Promise<HistoryFile[]> {
    const children = await listChildren(directory, cancellable);
    const subdirectories = children.filter(info => info.get_file_type() === Gio.FileType.DIRECTORY);
    const nested = await Promise.all(subdirectories.map(info => findHistoryFiles(directory.get_child(info.get_name()), cutoff, cancellable)));
    const files: HistoryFile[] = [];
    for (const info of children) {
        const mtime = info.get_attribute_uint64('time::modified');
        if (info.get_file_type() !== Gio.FileType.REGULAR || !info.get_name().endsWith('.jsonl') || mtime < cutoff)
            continue;
        const file = directory.get_child(info.get_name());
        files.push({file, path: file.get_path()!, size: info.get_size(), mtime});
    }
    return files.concat(...nested);
}

// Each file is read from where the previous pass stopped; files that did not change are not opened.
export async function scanHistory(
    instance: ProviderInstance,
    parseLine: (line: string) => UsageEvent | null,
    aggregates: AggregateStore,
    checkpoints: CheckpointStore,
    cancellable: Gio.Cancellable
): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - RETENTION_SECONDS;
    const roots = providerPaths(instance).historyDirectories.map(path => Gio.File.new_for_path(path));
    const found = await Promise.all(roots.map(root => findHistoryFiles(root, cutoff, cancellable)));
    const onLine = (line: string): void => {
        const event = parseLine(line);
        if (event)
            aggregates.add(instance.id, event);
    };
    for (const {file, path, size, mtime} of found.flat()) {
        const checkpoint = checkpoints.get(instance.id, path);
        const resumable = checkpoint && checkpoint.parserVersion === PARSER_VERSION && checkpoint.size <= size ? checkpoint : null;
        if (resumable && resumable.size === size && resumable.mtime === mtime)
            continue;
        let offset: number;
        try {
            // One file at a time keeps memory use and main-loop work per callback small.
            // eslint-disable-next-line no-await-in-loop
            offset = await scanJsonl(file, resumable?.offset ?? 0, onLine, cancellable);
        } catch (error) {
            if (isIoError(error, Gio.IOErrorEnum.NOT_FOUND))
                continue;
            throw error;
        }
        checkpoints.set({providerId: instance.id, path, size, mtime, offset, parserVersion: PARSER_VERSION});
    }
}
