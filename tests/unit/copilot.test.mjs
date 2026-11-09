import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCopilotUsage} from '../../build/tests/copilot-normalize.mjs';
import {parseGhHosts} from '../../build/tests/copilot-gh-hosts.mjs';

// Field names from a real Copilot Free response (values replaced).
const snapshot = (entitlement, percentRemaining, extra = {}) => ({
    overage_count: 0, overage_permitted: false, percent_remaining: percentRemaining, quota_id: 'q', quota_remaining: 0,
    unlimited: false, timestamp_utc: '2026-11-10T00:00:00.000Z', has_quota: true, quota_reset_at: 0, token_based_billing: false,
    credits_used: 0, remaining: Math.round(entitlement * percentRemaining / 100), entitlement, ...extra,
});
const response = (snapshots, sku = 'free_limited_copilot') => ({
    id: 1, login: 'someone', access_type_sku: sku, copilot_plan: 'individual', chat_enabled: true,
    quota_snapshots: snapshots, quota_reset_date: '2026-12-01', quota_reset_date_utc: '2026-12-01T00:00:00.000Z',
});
const RESET = Date.parse('2026-12-01T00:00:00.000Z');

test('Copilot Free shows chat and completions, not premium requests', () => {
    const {windows, plan} = normalizeCopilotUsage(response({
        chat: snapshot(200, 100), completions: snapshot(2000, 75), premium_interactions: snapshot(0, 0),
    }));
    assert.equal(plan, 'Copilot Free');
    assert.deepEqual(windows.map(window => [window.id, window.canonicalWindow, window.label, window.percent, window.resetAt]), [
        ['chat', 'other', 'Chat', 0, RESET],
        ['completions', 'other', 'Code Completions', 0.25, RESET],
    ]);
});

test("a paid plan's premium requests become the monthly limit", () => {
    const {windows, plan} = normalizeCopilotUsage(response({
        chat: snapshot(0, 100, {unlimited: true}), completions: snapshot(0, 100, {unlimited: true}), premium_interactions: snapshot(300, 40),
    }, 'monthly_subscriber'));
    assert.equal(plan, 'individual');
    assert.deepEqual(windows.map(window => [window.id, window.canonicalWindow, window.percent]), [['premium_interactions', 'monthly', 0.6]]);
});

test('unlimited snapshots are skipped and no usable snapshot is an unsupported account', () => {
    assert.throws(() => normalizeCopilotUsage(response({chat: snapshot(0, 100, {unlimited: true})})), {code: 'unsupported-account'});
    assert.throws(() => normalizeCopilotUsage({}), {code: 'unsupported-account'});
});

test('the GitHub CLI hosts file gives the active user, and a token only when stored in plain text', () => {
    const keyring = 'github.com:\n    git_protocol: https\n    users:\n        alice:\n    user: alice\n';
    assert.deepEqual(parseGhHosts(keyring), {user: 'alice', token: null});
    const plain = 'github.com:\n    oauth_token: gho_plain\n    git_protocol: https\n    user: bob\n';
    assert.deepEqual(parseGhHosts(plain), {user: 'bob', token: 'gho_plain'});
    assert.deepEqual(parseGhHosts('enterprise.example:\n    user: carol\n'), {user: null, token: null});
});

test('AI Credits plans count credits used out of the entitlement', () => {
    const {windows} = normalizeCopilotUsage(response({
        chat: snapshot(0, 100, {unlimited: true}),
        premium_interactions: snapshot(300, 99, {token_based_billing: true, credits_used: 120}),
    }, 'monthly_subscriber'));
    assert.deepEqual(windows.map(window => [window.id, window.percent, window.used, window.limit, window.unit]), [['premium_interactions', 0.4, 120, 300, 'credits']]);
});

test('request-based plans keep the percentage the service reports', () => {
    const {windows} = normalizeCopilotUsage(response({premium_interactions: snapshot(300, 40, {token_based_billing: false, credits_used: 0})}, 'monthly_subscriber'));
    assert.deepEqual(windows.map(window => [window.percent, window.unit]), [[0.6, null]]);
});
