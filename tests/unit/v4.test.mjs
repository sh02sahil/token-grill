import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeResetCredits} from '../../build/tests/reset-credits-normalize.mjs';
import {durationUntil, formatDuration} from '../../build/tests/time-math.mjs';
import {UNTRANSLATED} from '../../build/tests/i18n.mjs';

test('reset credits preserve authoritative count and earliest expiry', () => {
    const result = normalizeResetCredits({
        available_count: 4,
        credits: [
            {status: 'available', title: 'Full reset', expires_at: 1784246400},
            {status: 'redeemed', title: 'Used', expires_at: 1781000000},
            {status: 'available', title: 'Referral', expires_at: 1783000000},
        ],
    }, 1000);
    assert.equal(result.availableCount, 4);
    assert.deepEqual(result.credits, [
        {title: 'Full reset', expiresAt: 1784246400000},
        {title: 'Referral', expiresAt: 1783000000000},
    ]);
});

test('reset credits preserve a zero authoritative count without inventing rows', () => {
    const result = normalizeResetCredits({available_count: 0, total_earned_count: 3, credits: []}, 1000);
    assert.equal(result.availableCount, 0);
    assert.deepEqual(result.credits, []);
});

test('reset countdown uses days only when needed', () => {
    const format = (ms, compact = false) => formatDuration(UNTRANSLATED, durationUntil(ms, 0), compact);
    assert.equal(format(6 * 86400000 + 4 * 3600000 + 3 * 60000), '6d 4h 3m');
    assert.equal(format(6 * 86400000 + 4 * 3600000 + 3 * 60000, true), '6d 4h');
    assert.equal(format(2 * 86400000 + 14 * 60000), '2d 0h 14m');
    assert.equal(format(4 * 3600000 + 12 * 60000), '4h 12m');
    assert.equal(format(8 * 60000), '8m');
    assert.equal(format(30 * 1000), 'less than 1m');
    assert.equal(durationUntil(null, 0), null);
    assert.equal(durationUntil(-1000, 0).expired, true);
});
