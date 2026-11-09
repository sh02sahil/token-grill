import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateOf, identityFromCodexAuth, identityFromOpenCode} from '../../build/tests/account-identity.mjs';

const codexAuth = accountId => ({auth_mode: 'chatgpt', tokens: {access_token: 'a', refresh_token: 'r', account_id: accountId}});
const openAiEntry = accountId => ({type: 'oauth', access: 'a', refresh: 'r', expires: 1, accountId});

test('the same ChatGPT account in Codex CLI and OpenCode is a duplicate', () => {
    const existing = new Map([['work', identityFromCodexAuth(codexAuth('acct-1'))]]);
    assert.equal(duplicateOf(identityFromOpenCode('openai', openAiEntry('acct-1')), existing), 'work');
});

test('different account ids are not duplicates', () => {
    const existing = new Map([['work', identityFromCodexAuth(codexAuth('acct-1'))]]);
    assert.equal(duplicateOf(identityFromOpenCode('openai', openAiEntry('acct-2')), existing), null);
});

test('no identity never warns', () => {
    const existing = new Map([['work', null]]);
    assert.equal(identityFromCodexAuth({tokens: {}}), null);
    assert.equal(identityFromOpenCode('chutes', {type: 'api', key: 'k'}), null);
    assert.equal(duplicateOf(null, existing), null);
});
