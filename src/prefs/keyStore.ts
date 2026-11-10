import Gio from 'gi://Gio';
import type Secret from 'gi://Secret?version=1';

import {importSecret, TOKEN_GRILL_KEY_SCHEMA, type KeyringTexts} from '../providers/keyring.js';

const KEYRING_TEXTS: KeyringTexts = {
    missingLibrary: ({_}) => _('Saving an API key needs the libsecret library (gir1.2-secret-1).'),
    unavailable: ({_}) => _('The system keyring is not available.'),
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
export async function storeApiKey(accountId: string, label: string, key: string, cancellable: Gio.Cancellable): Promise<void> {
    const {library, schema} = await keyring();
    await library.password_store(schema, {account: accountId}, library.COLLECTION_DEFAULT, label, key, cancellable);
}

export async function clearApiKey(accountId: string, cancellable: Gio.Cancellable | null): Promise<void> {
    const {library, schema} = await keyring();
    await library.password_clear(schema, {account: accountId}, cancellable);
}
