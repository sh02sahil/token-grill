import test from 'node:test';
import assert from 'node:assert/strict';
import {deepSeekKeyFromClaudeSettings, normalizeDeepSeekBalance} from '../../build/tests/deepseek-normalize.mjs';
import {matchOpenCodeEntry} from '../../build/tests/opencode-entries.mjs';

// The documented response of GET api.deepseek.com/user/balance.
const balance = infos => ({is_available: true, balance_infos: infos});

test('the first finite balance is used', () => {
    assert.deepEqual(normalizeDeepSeekBalance(balance([
        {currency: 'CNY', total_balance: 'not a number', granted_balance: '0', topped_up_balance: '0'},
        {currency: 'USD', total_balance: '12.40', granted_balance: '0.00', topped_up_balance: '12.40'},
    ])), {amount: 12.4, currency: 'USD'});
});

test('numeric and string amounts parse, and no balance is a response error', () => {
    assert.deepEqual(normalizeDeepSeekBalance(balance([{currency: 'CNY', total_balance: 42.1}])), {amount: 42.1, currency: 'CNY'});
    assert.throws(() => normalizeDeepSeekBalance(balance([])), {code: 'response-shape'});
    assert.throws(() => normalizeDeepSeekBalance({}), {code: 'response-shape'});
});

test('Claude Code settings count only when pointed at DeepSeek', () => {
    const settings = (baseUrl, token = 'sk-deepseek') => ({env: {ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: token}});
    assert.equal(deepSeekKeyFromClaudeSettings(settings('https://api.deepseek.com/anthropic')), 'sk-deepseek');
    assert.equal(deepSeekKeyFromClaudeSettings(settings('https://api.anthropic.com')), null);
    assert.equal(deepSeekKeyFromClaudeSettings(settings('https://deepseek.com.evil.example/anthropic')), null);
    assert.equal(deepSeekKeyFromClaudeSettings({}), null);
});

test('a DeepSeek key in OpenCode belongs to DeepSeek', () => {
    assert.deepEqual(matchOpenCodeEntry('deepseek', {type: 'api', key: 'k'}), {status: 'service', kind: 'deepseek'});
});
