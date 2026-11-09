import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Secret from 'gi://Secret?version=1';

import {CollectorError, type ErrorText} from '../core/errors.js';
import {isCancellation} from '../core/gio.js';

// A running Secret Service answers in milliseconds, but when none is running
// D-Bus activation waits about 25 seconds, which would stall every refresh.
const LOOKUP_TIMEOUT_MS = 3000;

export interface KeyringTexts {
    // libsecret is not installed.
    missingLibrary: ErrorText;
    // No Secret Service answered in time, or the keyring is locked.
    unavailable: ErrorText;
}

async function importSecret(texts: KeyringTexts): Promise<typeof Secret> {
    let module: {default: typeof Secret};
    try {
        module = await import('gi://Secret?version=1');
    } catch {
        throw new CollectorError('dependency', texts.missingLibrary);
    }
    Gio._promisify(module.default, 'password_lookup', 'password_lookup_finish');
    return module.default;
}

// Reads another app's keyring item. Never asks the keyring to unlock: a password
// prompt during a background refresh would be hostile, so a locked keyring counts
// as unavailable.
export async function lookupSecret(
    schemaName: string,
    attributes: Record<string, string>,
    cancellable: Gio.Cancellable,
    texts: KeyringTexts
): Promise<string | null> {
    const Secret = await importSecret(texts);
    const attributeTypes = Object.fromEntries(Object.keys(attributes).map(name => [name, Secret.SchemaAttributeType.STRING]));
    const schema = Secret.Schema.new(schemaName, Secret.SchemaFlags.NONE, attributeTypes);
    const lookup = new Gio.Cancellable();
    let timedOut = false;
    let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LOOKUP_TIMEOUT_MS, () => {
        timeoutId = 0;
        timedOut = true;
        lookup.cancel();
        return GLib.SOURCE_REMOVE;
    });
    const removeTimeout = () => {
        if (timeoutId) {
            GLib.Source.remove(timeoutId);
            timeoutId = 0;
        }
    };
    // Connected after the timeout exists: connect() runs the handler at once
    // when the cancellable is already cancelled.
    const parentId = cancellable.connect(() => {
        removeTimeout();
        lookup.cancel();
    });
    try {
        return await Secret.password_lookup(schema, attributes, lookup);
    } catch (error) {
        if (!timedOut && (isCancellation(error) || !(error instanceof GLib.Error)))
            throw error;
        throw new CollectorError('dependency', texts.unavailable);
    } finally {
        removeTimeout();
        cancellable.disconnect(parentId);
    }
}
