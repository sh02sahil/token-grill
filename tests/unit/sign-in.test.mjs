import test from 'node:test';
import assert from 'node:assert/strict';
import {UNTRANSLATED} from './untranslated.mjs';
import {errorText} from '../../build/tests/popup-model.mjs';
import {canRenewSignIn, execLine, signInCommand} from '../../build/tests/sign-in.mjs';

// The service says whether the account lives in the default home of its CLI.
test('the default home signs in with the plain command', () => {
    assert.deepEqual(signInCommand({app: 'codex-cli', accountHome: '~/.codex'}, true).argv, ['codex', 'login']);
    assert.deepEqual(signInCommand({app: 'claude-code', accountHome: '~/.claude'}, true).argv, ['claude', 'auth', 'login']);
    assert.deepEqual(signInCommand({app: 'cursor-agent', accountHome: '~/.config/cursor'}, true).argv, ['agent', 'login']);
    assert.deepEqual(signInCommand({app: 'opencode', accountHome: '~/.local/share/opencode'}, true).argv, ['opencode', 'auth', 'login']);
});

test('another home is passed through the CLI\'s own variable, without a shell', () => {
    assert.deepEqual(signInCommand({app: 'codex-cli', accountHome: '~/.codex-work'}, false).argv,
        ['env', 'CODEX_HOME=/home/test/.codex-work', 'codex', 'login']);
    assert.deepEqual(signInCommand({app: 'claude-code', accountHome: '/home/test/my claude'}, false).argv,
        ['env', 'CLAUDE_CONFIG_DIR=/home/test/my claude', 'claude', 'auth', 'login']);
    assert.deepEqual(signInCommand({app: 'github-cli', accountHome: '~/gh-work'}, false).argv,
        ['env', 'GH_CONFIG_DIR=/home/test/gh-work', 'gh', 'auth', 'login']);
});

test('apps that cannot be pointed at another home, or have no login command, get no button', () => {
    assert.equal(signInCommand({app: 'cursor-agent', accountHome: '~/other'}, false), null);
    assert.equal(signInCommand({app: 'kiro-cli', accountHome: '~/other'}, false), null);
    assert.equal(signInCommand({app: 'cursor', accountHome: '~/.config/Cursor'}, true), null);
    assert.equal(signInCommand({app: 'keyring', accountHome: ''}, true), null);
});

test('the hint names the variable for an account in another home', () => {
    const errorInfo = {code: 'auth-missing', messageId: 'codex.auth-missing', params: {}, recovery: 'reauthenticate'};
    assert.equal(errorText(UNTRANSLATED, {errorInfo, homeIsDefault: false}, {kind: 'codex', app: 'codex-cli', accountHome: '~/.codex-work'}),
        'Codex is not signed in. Run codex login with CODEX_HOME set to ~/.codex-work.');
    assert.equal(errorText(UNTRANSLATED, {errorInfo, homeIsDefault: true}, {kind: 'codex', app: 'codex-cli', accountHome: '~/.codex'}),
        'Codex is not signed in. Run codex login.');
});

test('an app name from the bus that is a member of every object gets no button', () => {
    for (const app of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
        assert.equal(signInCommand({app, accountHome: '~/.codex'}, true), null, app);
});

test('copilot signs in inside its own session, so it gets a hint and no button', () => {
    assert.equal(signInCommand({app: 'copilot-cli', accountHome: ''}, true), null);
    const errorInfo = {code: 'auth-expired', messageId: 'copilot.token-expired', params: {}, recovery: 'reauthenticate'};
    assert.match(errorText(UNTRANSLATED, {errorInfo, homeIsDefault: true}, {kind: 'copilot', app: 'copilot-cli', accountHome: ''}),
        / Run copilot and sign in with \/login\.$/);
    assert.match(errorText(UNTRANSLATED, {errorInfo, homeIsDefault: true}, {kind: 'cursor', app: 'cursor-agent', accountHome: '~/.config/cursor'}),
        / Run agent login\.$/);
});

test('the hints take each login command from the sign-in table', async () => {
    const {readFile} = await import('node:fs/promises');
    const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const [model, dialog] = await Promise.all([read('src/core/popupModel.ts'), read('src/prefs/addAccountDialog.ts')]);
    for (const command of ['codex login', 'claude auth login', 'kiro-cli login', 'gh auth login', 'opencode auth login', 'agent login', 'Run copilot', '\'copilot\', \'/login\''])
        assert.ok(!model.includes(command) && !dialog.includes(command), command);
});

// What GLib does to an Exec line before it splits it: each %% becomes %, and
// every other field code is replaced or dropped.
function expandFieldCodes(line) {
    return line.replace(/%(.)/g, (_match, code) => code === '%' ? '%' : '');
}

test('a percent sign in an account home cannot reach the field-code expansion', () => {
    for (const home of ['/home/test/.claude%c sh -c "touch x" x\'', '/home/test/a%fb', '/home/test/a%%b', '/home/test/a%', '/home/test/50%u'])  {
        const argv = ['env', `CLAUDE_CONFIG_DIR=${home}`, 'claude', 'auth', 'login'];
        const quoted = argv.map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
        assert.equal(expandFieldCodes(execLine(argv)), quoted, home);
    }
});

// The service starts only these CLIs to renew a sign-in; other apps, OpenCode among them, get no switch.
test('only Claude Code, the Codex CLI and agy accounts can renew an expired sign-in', () => {
    assert.equal(canRenewSignIn({kind: 'claude', app: 'claude-code'}), true);
    assert.equal(canRenewSignIn({kind: 'codex', app: 'codex-cli'}), true);
    assert.equal(canRenewSignIn({kind: 'antigravity', app: 'antigravity'}), true);
    assert.equal(canRenewSignIn({kind: 'claude', app: 'opencode'}), false);
    assert.equal(canRenewSignIn({kind: 'codex', app: 'opencode'}), false);
    assert.equal(canRenewSignIn({kind: 'kiro', app: 'kiro-cli'}), false);
    assert.equal(canRenewSignIn({kind: 'cursor', app: 'cursor-agent'}), false);
});
