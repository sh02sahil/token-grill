import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOpenCodeGoUsage} from '../../build/tests/opencode-go-normalize.mjs';
import {matchOpenCodeEntry} from '../../build/tests/opencode-entries.mjs';

// Community-observed shape of GET opencode.ai/zen/go/v1/usage (not yet seen live).
const usage = {
    rolling: {status: 'ok', percent: 22, resetsAt: '2026-11-10T14:00:00.000Z'},
    weekly: {status: 'ok', percent: 29.5, resetsAt: '2026-11-16T00:00:00.000Z'},
    monthly: {status: 'ok', percent: 41, resetsAt: '2026-11-21T00:00:00.000Z'},
};

test('rolling, weekly and monthly become three limits', () => {
    assert.deepEqual(normalizeOpenCodeGoUsage(usage).map(window => [window.id, window.canonicalWindow, window.percent, window.resetAt]), [
        ['rolling', 'five-hour', 0.22, Date.parse('2026-11-10T14:00:00.000Z')],
        ['weekly', 'weekly', 0.295, Date.parse('2026-11-16T00:00:00.000Z')],
        ['monthly', 'monthly', 0.41, Date.parse('2026-11-21T00:00:00.000Z')],
    ]);
});

test('a rate-limited window counts as full', () => {
    const windows = normalizeOpenCodeGoUsage({...usage, weekly: {status: 'rate-limited', percent: 87, resetsAt: null}});
    assert.equal(windows.find(window => window.id === 'weekly').percent, 1);
});

test('both response layouts parse', () => {
    assert.equal(normalizeOpenCodeGoUsage({usage}).length, 3);
    assert.deepEqual(normalizeOpenCodeGoUsage({}), []);
});

test('OpenCode Go keys belong to OpenCode Go', () => {
    assert.deepEqual(matchOpenCodeEntry('opencode-go', {type: 'api', key: 'k'}), {status: 'service', kind: 'opencode-go'});
    assert.deepEqual(matchOpenCodeEntry('opencode', {type: 'api', key: 'k'}), {status: 'service', kind: 'opencode-go'});
});
