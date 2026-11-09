import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceWindow, nextBalanceReference} from '../../build/tests/balance-meter.mjs';

const cny = amount => ({amount, currency: 'CNY'});
const step = (reference, amounts) => amounts.reduce((current, amount) => nextBalanceReference(current, cny(amount)), reference);

test('the first reading counts as full', () => {
    const reference = nextBalanceReference(null, cny(80));
    assert.deepEqual(reference, {currency: 'CNY', full: 80, last: 80});
    assert.equal(balanceWindow(cny(80), reference).percent, 0);
});

test('spending keeps the full amount', () => {
    const reference = step(null, [100, 70, 42]);
    assert.deepEqual(reference, {currency: 'CNY', full: 100, last: 42});
    assert.ok(Math.abs(balanceWindow(cny(42), reference).percent - 0.58) < 1e-9);
});

test('a top-up starts a new full amount, even below the old one', () => {
    const reference = step(null, [100, 10, 60]);
    assert.equal(reference.full, 60);
    assert.equal(balanceWindow(cny(60), reference).percent, 0);
});

test('a currency change starts over', () => {
    const reference = nextBalanceReference({currency: 'USD', full: 50, last: 20}, cny(30));
    assert.deepEqual(reference, {currency: 'CNY', full: 30, last: 30});
});

test('an empty account reads as fully used', () => {
    const reference = step(null, [0]);
    assert.equal(balanceWindow(cny(0), reference).percent, 1);
});

test('the balance limit is keyed so it can be ticked like any other limit', () => {
    const window = balanceWindow(cny(42), {currency: 'CNY', full: 100, last: 42});
    assert.deepEqual([window.id, window.canonicalWindow, window.label, window.resetAt], ['balance', 'other', 'Balance', null]);
});
