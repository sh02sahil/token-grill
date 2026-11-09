import type Gio from 'gi://Gio';

import {openCodeAuthPath} from '../../core/paths.js';
import {readCredentialJson} from '../credentials.js';
import {parseOpenCodeAuth, type OpenCodeEntry} from './entries.js';

export async function readOpenCodeEntries(cancellable: Gio.Cancellable | null): Promise<Map<string, OpenCodeEntry>> {
    return parseOpenCodeAuth(await readCredentialJson(openCodeAuthPath(), cancellable));
}
