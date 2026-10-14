import test from 'node:test';
import assert from 'node:assert/strict';
import {historyMetrics} from '../../build/tests/history-metrics.mjs';

const instance = (overrides = {}) => ({kind: 'codex', localHistoryEnabled: true, ...overrides});
const runtime = (phase = 'idle', history = null) => ({phase, outcome: null, completedAt: null, sources: {'limits': null, 'reset-credits': null, history}});
const snapshot = (overrides = {}) => ({
    localHistoryUpdatedAt: 1,
    todayTotals: {total: 12400},
    monthTotals: {total: 42000},
    monthCost: 3.42,
    ...overrides,
});

test('history metrics distinguish unsupported, disabled, pending, updating, and initial failure', () => {
    assert.equal(historyMetrics(instance({kind: 'kiro'}), null, runtime()).state, 'unsupported');
    assert.equal(historyMetrics(instance({localHistoryEnabled: false}), null, runtime()).state, 'off');
    assert.equal(historyMetrics(instance(), null, runtime()).state, 'waiting');
    assert.equal(historyMetrics(instance(), null, null).state, 'waiting');
    assert.equal(historyMetrics(instance(), null, runtime('scanning-history')).state, 'updating');
    assert.equal(historyMetrics(instance(), null, runtime('idle', 'failed')).state, 'failed');
});

test('successful history metrics carry token totals and cost, including a free empty month', () => {
    assert.deepEqual(historyMetrics(instance(), snapshot(), runtime('idle', 'success')), {
        state: 'ready',
        todayTokens: 12400,
        monthTokens: 42000,
        monthCost: 3.42,
    });
    const empty = historyMetrics(instance(), snapshot({todayTotals: {total: 0}, monthTotals: {total: 0}, monthCost: null}), runtime());
    assert.equal(empty.todayTokens, 0);
    assert.equal(empty.monthCost, 0);
});

test('unpriced history has no cost and cached metrics survive later scan failure', () => {
    assert.equal(historyMetrics(instance(), snapshot({monthCost: null}), runtime()).monthCost, null);
    const cached = historyMetrics(instance(), snapshot(), runtime('idle', 'failed'));
    assert.equal(cached.state, 'ready');
    assert.equal(cached.monthTokens, 42000);
});
