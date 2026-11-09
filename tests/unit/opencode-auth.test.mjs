import test from 'node:test';
import assert from 'node:assert/strict';
import {matchOpenCodeEntry, openCodeAccessToken, parseOpenCodeAuth} from '../../build/tests/opencode-entries.mjs';

// The field names seen in a real OpenCode auth.json (values replaced).
const auth = {
    openai: {type: 'oauth', refresh: 'r-token', access: 'a-token', expires: 1794200000000, accountId: 'acct-1'},
    anthropic: {type: 'api', key: 'k-anthropic'},
    kiro: {type: 'api', key: 'k-kiro'},
    chutes: {type: 'api', key: 'k-chutes'},
    broken: {type: 'oauth'},
    alsoBroken: 'not an entry',
};

test('oauth and api entries parse', () => {
    const entries = parseOpenCodeAuth(auth);
    assert.deepEqual(entries.get('openai'), {type: 'oauth', access: 'a-token', refresh: 'r-token', expires: 1794200000000, accountId: 'acct-1'});
    assert.deepEqual(entries.get('chutes'), {type: 'api', key: 'k-chutes'});
});

test('unknown shapes are dropped', () => {
    const entries = parseOpenCodeAuth(auth);
    assert.equal(entries.has('broken'), false);
    assert.equal(entries.has('alsoBroken'), false);
});

test('a ChatGPT sign-in belongs to Codex', () => {
    assert.deepEqual(matchOpenCodeEntry('openai', parseOpenCodeAuth(auth).get('openai')), {status: 'service', kind: 'codex'});
});

test('an Anthropic API key is nothing to track', () => {
    assert.deepEqual(matchOpenCodeEntry('anthropic', {type: 'api', key: 'k'}), {status: 'nothing-to-track'});
    assert.deepEqual(matchOpenCodeEntry('anthropic', {type: 'oauth', access: 'a', refresh: null, expires: null, accountId: null}), {status: 'service', kind: 'claude'});
});

test('Kiro in OpenCode uses the Kiro app sign-in', () => {
    assert.deepEqual(matchOpenCodeEntry('kiro', {type: 'api', key: 'k'}), {status: 'uses-other-app', kind: 'kiro'});
});

test('other providers are nothing to track', () => {
    assert.deepEqual(matchOpenCodeEntry('chutes', {type: 'api', key: 'k'}), {status: 'nothing-to-track'});
});

const NOW = 1794200000000;
const oauth = expires => ({type: 'oauth', access: 'a-token', refresh: 'r', expires, accountId: null});

test('a valid OpenCode sign-in gives its access token', () => {
    assert.equal(openCodeAccessToken(oauth(NOW + 60000), NOW), 'a-token');
    assert.equal(openCodeAccessToken(oauth(null), NOW), 'a-token');
});

test('an expired OpenCode sign-in reports auth-expired', () => {
    assert.throws(() => openCodeAccessToken(oauth(NOW - 1), NOW), {code: 'auth-expired'});
});

test('an OpenCode API key where a sign-in is needed is auth-invalid', () => {
    assert.throws(() => openCodeAccessToken({type: 'api', key: 'k'}, NOW), {code: 'auth-invalid'});
});

test('a missing OpenCode sign-in is auth-missing', () => {
    assert.throws(() => openCodeAccessToken(undefined, NOW), {code: 'auth-missing'});
});
