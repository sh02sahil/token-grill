import test from 'node:test';
import assert from 'node:assert/strict';
import {costFor} from '../../build/tests/pricing-calculator.mjs';

const totals = {input: 1_000_000, output: 500_000, cachedInput: 2_000_000, cacheWrite: 0, reasoning: 0, total: 1_500_000};

test('costs are computed per million tokens', () => {
    assert.equal(costFor(totals, {input: 1, output: 4, cachedInput: 0.1, cacheWrite: 2}), 1 + 2 + 0.2);
});

test('cache rates fall back to the input rate', () => {
    assert.equal(costFor(totals, {input: 1, output: 4}), 1 + 2 + 2);
});
