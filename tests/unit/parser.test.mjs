import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeUsageEvent} from '../../build/tests/claude-history.mjs';
import {codexUsageEvent} from '../../build/tests/codex-history.mjs';

const codexLine = usage => JSON.stringify({
    timestamp: '2026-08-07T00:00:00Z',
    type: 'event_msg',
    payload: {type: 'token_count', info: {last_token_usage: usage, total_token_usage: {input_tokens: 999}}},
});

test('Codex token_count events yield the last turn without retaining content', () => {
    const event = codexUsageEvent(codexLine({input_tokens: 10, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 2, total_tokens: 15}));
    assert.deepEqual(event, {
        capturedAt: Date.parse('2026-08-07T00:00:00Z'),
        model: null,
        totals: {input: 10, output: 5, cachedInput: 4, cacheWrite: 0, reasoning: 2, total: 15},
    });
});

test('Codex records without usage or a timestamp are ignored', () => {
    assert.equal(codexUsageEvent(JSON.stringify({type: 'response_item', payload: {type: 'message', text: '"token_count"'}})), null);
    assert.equal(codexUsageEvent(JSON.stringify({type: 'event_msg', payload: {type: 'token_count', info: null}})), null);
    assert.equal(codexUsageEvent(codexLine({input_tokens: 0, output_tokens: 0})), null);
    assert.equal(codexUsageEvent('{"token_count": truncated'), null);
});

test('Claude assistant messages yield usage and model', () => {
    const line = JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-07T01:00:00Z',
        message: {model: 'claude-sonnet', usage: {input_tokens: 3, output_tokens: 7, cache_read_input_tokens: 100, cache_creation_input_tokens: 20}},
    });
    assert.deepEqual(claudeUsageEvent(line), {
        capturedAt: Date.parse('2026-08-07T01:00:00Z'),
        model: 'claude-sonnet',
        totals: {input: 3, output: 7, cachedInput: 100, cacheWrite: 20, reasoning: 0, total: 10},
    });
});

test('Claude lines without usage or a valid timestamp are ignored', () => {
    assert.equal(claudeUsageEvent(JSON.stringify({type: 'user', message: {content: 'usage'}})), null);
    assert.equal(claudeUsageEvent(JSON.stringify({timestamp: 'never', message: {usage: {input_tokens: 1}}})), null);
    assert.equal(claudeUsageEvent('{"usage": '), null);
});
