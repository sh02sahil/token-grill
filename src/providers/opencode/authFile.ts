import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {CollectorError} from '../../core/errors.js';
import {formatText} from '../../core/i18n.js';
import {readCredentialJson} from '../credentials.js';
import {parseOpenCodeAuth, type OpenCodeEntry} from './entries.js';

export function openCodeAuthPath(): string {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'opencode', 'auth.json']);
}

export async function readOpenCodeEntries(cancellable: Gio.Cancellable | null): Promise<Map<string, OpenCodeEntry>> {
    return parseOpenCodeAuth(await readCredentialJson(openCodeAuthPath(), cancellable));
}

export async function readOpenCodeEntry(id: string, cancellable: Gio.Cancellable | null): Promise<OpenCodeEntry> {
    const entry = (await readOpenCodeEntries(cancellable)).get(id);
    if (!entry)
        throw new CollectorError('auth-missing', ({_}) => formatText(_('OpenCode has no sign-in for %s.'), id));
    return entry;
}
