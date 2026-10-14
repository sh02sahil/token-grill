// Reads a synthetic kiro-cli database through the built extension's Gda code,
// then confirms that a read-only connection refuses writes. Uses no network
// and no real data. Run `npm run build` first.
import Gda from 'gi://Gda?version=5.0';
import GLib from 'gi://GLib';

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const [, metadata] = GLib.file_get_contents(`${root}/metadata.json`);
const dist = `${root}/dist/${JSON.parse(new TextDecoder().decode(metadata)).uuid}`;
const {readKiroAuth} = await import(`file://${dist}/providers/kiro/auth.js`);

// A directory name that needs RFC 1738 encoding in the connection string.
const directory = GLib.dir_make_tmp('tokengrill kiro;XXXXXX');
const database = GLib.build_filenamev([directory, 'data.sqlite3']);
const connectionString = `DB_DIR=${Gda.rfc1738_encode(directory)};DB_NAME=data.sqlite3`;
const token = JSON.stringify({access_token: 'sanitized', expires_at: '2030-01-01T00:00:00Z', region: 'eu-central-1'});
const profile = JSON.stringify({arn: 'arn:aws:codewhisperer:eu-central-1:1:profile/fixture', profile_name: 'fixture'});

Gda.init();
const writable = Gda.Connection.open_from_string('SQLite', connectionString, null, Gda.ConnectionOptions.NONE);
writable.execute_non_select_command('CREATE TABLE auth_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
writable.execute_non_select_command('CREATE TABLE state (key TEXT PRIMARY KEY, value BLOB)');
writable.execute_non_select_command(`INSERT INTO auth_kv VALUES ('kirocli:odic:token', '${token}')`);
writable.execute_non_select_command(`INSERT INTO state VALUES ('api.codewhisperer.profile', '${profile}')`);
writable.close();

const auth = await readKiroAuth(database);
if (auth.accessToken !== 'sanitized' || auth.serviceRegion !== 'eu-central-1' || !auth.profileArn)
    throw new Error('The Kiro fixture was not read correctly');

const readonly = Gda.Connection.open_from_string('SQLite', connectionString, null, Gda.ConnectionOptions.READ_ONLY);
readonly.execute_select_command('PRAGMA query_only = ON');
let refused = false;
try {
    readonly.execute_non_select_command("UPDATE auth_kv SET value = 'changed'");
} catch {
    refused = true;
}
readonly.close();
GLib.unlink(database);
GLib.rmdir(directory);
if (!refused)
    throw new Error('A read-only Gda connection accepted a write');
console.log('Kiro Gda read-only check passed');
