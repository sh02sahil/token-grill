import test from 'node:test';
import assert from 'node:assert/strict';
import {openCodeCandidates} from '../../build/tests/account-candidates.mjs';

const oauth = accountId => ({type: 'oauth', access: 'a', refresh: 'r', expires: null, accountId});
const account = (id, kind, app) => ({id, kind, app, accountHome: '~/.x'});

test('OpenCode sign-ins join their own service, with duplicates and greyed keys marked', () => {
    const entries = new Map([
        ['openai', oauth('acct-1')],
        ['anthropic', oauth(null)],
        ['kiro', oauth(null)],
        ['chutes', {type: 'api', key: 'k'}],
        ['deepseek', {type: 'api', key: 'k'}],
    ]);
    const configured = [account('work', 'codex', 'codex-cli'), account('main', 'claude', 'opencode')];
    const identities = new Map([['work', {kind: 'codex', key: 'acct-1'}], ['main', null]]);
    const found = openCodeCandidates(entries, configured, identities, '/data/opencode');
    const byLabel = Object.fromEntries(found.map(item => [item.label, item]));
    assert.deepEqual(found.map(item => item.label), ['Codex', 'DeepSeek', 'Claude', 'Kiro', 'chutes']);
    assert.deepEqual(byLabel.Codex, {kind: 'codex', app: 'opencode', accountHome: '/data/opencode', label: 'Codex', status: 'ready', duplicateOf: 'work'});
    assert.equal(byLabel.Claude.status, 'already-added');
    assert.equal(byLabel.DeepSeek.status, 'ready');
    assert.equal(byLabel.Kiro.status, 'uses-other-app');
    assert.deepEqual(byLabel.chutes, {kind: null, app: 'opencode', accountHome: '/data/opencode', label: 'chutes', status: 'nothing-to-track', duplicateOf: null});
});
