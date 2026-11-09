import type Gio from 'gi://Gio';

import {CollectorError} from '../../core/errors.js';
import {readOpenCodeEntries} from '../opencode/authFile.js';

// OpenCode stores the Go key as an API key, under its own id or the shared Zen one.
export async function loadOpenCodeGoKey(cancellable: Gio.Cancellable | null): Promise<string> {
    const entries = await readOpenCodeEntries(cancellable);
    const entry = entries.get('opencode-go') ?? entries.get('opencode');
    if (entry?.type !== 'api')
        throw new CollectorError('auth-missing', ({_}) => _('OpenCode has no OpenCode Go key.'));
    return entry.key;
}
