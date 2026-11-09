import test from 'node:test';
import assert from 'node:assert/strict';
import {matchOpenCodeEntry, parseOpenCodeAuth} from '../../build/tests/opencode-entries.mjs';

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
