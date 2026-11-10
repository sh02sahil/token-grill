import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Gtk from 'gi://Gtk';
import type Secret from 'gi://Secret?version=1';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {CollectorError} from '../core/errors.js';
import {isCancellation} from '../core/gio.js';
import {importSecret, TOKEN_GRILL_KEY_SCHEMA, type KeyringTexts} from '../providers/keyring.js';
import {TRANSLATOR} from './translator.js';

const KEYRING_TEXTS: KeyringTexts = {
    missingLibrary: tr => tr._('Saving an API key needs the libsecret library (gir1.2-secret-1).'),
    unavailable: tr => tr._('The system keyring is not available.'),
};

interface Keyring {
    library: typeof Secret;
    schema: Secret.Schema;
}

async function keyring(): Promise<Keyring> {
    const library = await importSecret(KEYRING_TEXTS);
    Gio._promisify(library, 'password_store', 'password_store_finish');
    Gio._promisify(library, 'password_clear', 'password_clear_finish');
    const schema = library.Schema.new(TOKEN_GRILL_KEY_SCHEMA, library.SchemaFlags.NONE, {account: library.SchemaAttributeType.STRING});
    return {library, schema};
}

// Token Grill's own keyring item for a pasted key. Saving is a user action in
// the preferences, so here the keyring may ask to be unlocked.
export async function storeApiKey(accountId: string, key: string, cancellable: Gio.Cancellable): Promise<void> {
    const {library, schema} = await keyring();
    await library.password_store(schema, {account: accountId}, library.COLLECTION_DEFAULT, _('Token Grill: DeepSeek API key'), key, cancellable);
}

export function presentKeyError(error: unknown, parent: Gtk.Widget): void {
    if (isCancellation(error))
        return;
    let body: string;
    if (error instanceof CollectorError) {
        body = error.text(TRANSLATOR);
    } else if (error instanceof GLib.Error) {
        body = _('The system keyring did not save the key.');
    } else {
        logError(error instanceof Error ? error : new Error(String(error)), 'Token Grill');
        return;
    }
    const alert = new Adw.AlertDialog({heading: _('Could Not Save the Key'), body});
    alert.add_response('close', _('Close'));
    alert.present(parent);
}

export async function clearApiKey(accountId: string, cancellable: Gio.Cancellable | null): Promise<void> {
    const {library, schema} = await keyring();
    await library.password_clear(schema, {account: accountId}, cancellable);
}
