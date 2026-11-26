import assert from 'node:assert/strict';
import test from 'node:test';
import {Scheduler} from '../../build/tests/scheduler.mjs';

const NOW = Date.UTC(2026, 9, 13, 10, 0);
const ACCOUNT = {id: 'account', enabled: true, liveUsageEnabled: true};

function start(t) {
    const batches = [];
    let now = NOW;
    let wake;
    t.mock.method(Date, 'now', () => now);
    t.mock.method(globalThis, 'setInterval', callback => {
        wake = callback;
        return 1;
    });
    t.mock.method(globalThis, 'clearInterval', () => undefined);
    const scheduler = new Scheduler(jobs => batches.push(jobs), 600);
    t.after(() => scheduler.destroy());
    scheduler.start();
    scheduler.setProviders([ACCOUNT]);
    scheduler.refresh([ACCOUNT.id]);
    scheduler.complete();
    return {
        scheduler,
        batches,
        wakeAt: seconds => {
            now = NOW + seconds * 1000;
            wake();
        },
    };
}

test('the scheduler refreshes once after each distinct quota reset before the regular interval', t => {
    const {scheduler, batches, wakeAt} = start(t);
    scheduler.setQuotaResets(ACCOUNT.id, [
        {resetAt: NOW + 31000}, {resetAt: NOW + 31000}, {resetAt: NOW + 61000}, {resetAt: NOW - 35000}, {resetAt: null},
    ], NOW);
    wakeAt(60);
    assert.equal(batches.length, 1);
    wakeAt(75);
    assert.deepEqual(batches[1], [{provider: ACCOUNT, manual: false}]);
    scheduler.complete();
    wakeAt(90);
    assert.equal(batches.length, 2);
    wakeAt(105);
    assert.deepEqual(batches[2], [{provider: ACCOUNT, manual: false}]);
    scheduler.complete();
    wakeAt(120);
    assert.equal(batches.length, 3);
});

test('a successful quota reading replaces obsolete reset times', t => {
    const {scheduler, batches, wakeAt} = start(t);
    scheduler.setQuotaResets(ACCOUNT.id, [{resetAt: NOW + 15000}], NOW);
    scheduler.setQuotaResets(ACCOUNT.id, [{resetAt: NOW + 75000}], NOW);
    wakeAt(45);
    assert.equal(batches.length, 1);
    wakeAt(105);
    assert.equal(batches.length, 2);
    scheduler.setQuotaResets(ACCOUNT.id, [{resetAt: NOW + 75000}], NOW + 105000);
    scheduler.complete();
    wakeAt(120);
    assert.equal(batches.length, 2);
});

test('a due reset is kept while paused and coalesced with a manual refresh on resume', t => {
    const {scheduler, batches, wakeAt} = start(t);
    scheduler.setQuotaResets(ACCOUNT.id, [{resetAt: NOW + 15000}], NOW);
    scheduler.setPaused(true);
    wakeAt(45);
    assert.equal(batches.length, 1);
    scheduler.setPaused(false);
    scheduler.refresh([ACCOUNT.id]);
    assert.deepEqual(batches[1], [{provider: ACCOUNT, manual: true}]);
    scheduler.complete();
    wakeAt(60);
    assert.equal(batches.length, 2);
});

test('removing an account clears its pending quota reset', t => {
    const {scheduler, batches, wakeAt} = start(t);
    scheduler.setQuotaResets(ACCOUNT.id, [{resetAt: NOW + 15000}], NOW);
    scheduler.setProviders([]);
    scheduler.setProviders([ACCOUNT]);
    scheduler.refresh([ACCOUNT.id]);
    scheduler.complete();
    wakeAt(45);
    assert.equal(batches.length, 2);
});
