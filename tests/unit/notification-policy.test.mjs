import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clampStep,
    notificationBucket,
    milestoneNotificationText,
    notificationHeader,
    shouldNotifyMilestone,
    parseTestNotificationRequest,
    testNotificationText,
    windowTitle,
} from '../../build/tests/notification-policy.mjs';
import {UNTRANSLATED} from '../../build/tests/i18n.mjs';

const tr = UNTRANSLATED;
const provider = (preference, kind = 'codex') => ({id: 'codex-personal', kind, displayName: 'Codex - Personal', panelWindowPreference: preference});
const snapshot = {
    windows: [
        {id: 'five', canonicalWindow: 'five-hour', label: 'Five-hour', percent: 0.42},
        {id: 'week', canonicalWindow: 'weekly', label: 'Weekly', percent: 0.68},
        {id: 'month', canonicalWindow: 'monthly', label: 'Monthly', percent: 0.51},
    ],
};

test('first observation seeds silently and later bucket crossing notifies once', () => {
    assert.equal(shouldNotifyMilestone(null, 'weekly:reset-1', 6, 10), false);
    const previous = {resetIdentity: 'weekly:reset-1', lastNotifiedBucket: 6, configuredStep: 10};
    assert.equal(shouldNotifyMilestone(previous, 'weekly:reset-1', 6, 10), false);
    assert.equal(shouldNotifyMilestone(previous, 'weekly:reset-1', 7, 10), true);
    assert.equal(shouldNotifyMilestone(previous, 'weekly:reset-2', 7, 10), false);
});

test('notification buckets are clamped and step-normalized', () => {
    assert.equal(clampStep(24), 25);
    assert.equal(clampStep(1), 5);
    assert.equal(clampStep(90), 50);
    assert.equal(notificationBucket(0.68, 10), 6);
    assert.equal(notificationBucket(1.2, 10), 10);
    assert.equal(notificationBucket(0.26, 24), 1);
});

test('notification titles use header capitalization per window', () => {
    assert.equal(windowTitle(tr, 'five-hour', 'Session'), 'Five-Hour Usage');
    assert.equal(windowTitle(tr, 'weekly', 'Weekly'), 'Weekly Usage');
    assert.equal(windowTitle(tr, 'monthly', 'Monthly credits'), 'Monthly Usage');
    assert.equal(windowTitle(tr, 'other', 'Daily'), 'Daily Usage');
});

test('the header names the reading and the account in the display mode', () => {
    assert.equal(notificationHeader(tr, 'Claude - Team', 0.34, 'remaining'), '66% remaining - Claude - Team | Token Grill');
    assert.equal(notificationHeader(tr, 'Claude - Team', 0.34, 'used'), '34% used - Claude - Team | Token Grill');
    assert.equal(notificationHeader(tr, 'Claude - Team', 1.2, 'remaining'), '0% remaining - Claude - Team | Token Grill');
});

test('milestone alerts name the window and state the milestone in the display mode', () => {
    const account = {displayName: 'Claude - Team'};
    const window = {canonicalWindow: 'five-hour', label: 'Five-hour'};
    assert.deepEqual(milestoneNotificationText(tr, account, window, 0.34, 30, 'remaining'), {
        header: '66% remaining - Claude - Team | Token Grill',
        title: 'Five-Hour Usage',
        body: 'Crossed the 70% remaining milestone',
    });
    assert.deepEqual(milestoneNotificationText(tr, account, window, 0.34, 30, 'used'), {
        header: '34% used - Claude - Team | Token Grill',
        title: 'Five-Hour Usage',
        body: 'Crossed the 30% used milestone',
    });
    assert.equal(milestoneNotificationText(tr, account, {canonicalWindow: 'monthly', label: 'Monthly credits'}, 0.51, 50, 'remaining').title, 'Monthly Usage');
});

test('test notifications use the selected window and its current reading', () => {
    assert.equal(testNotificationText(tr, provider('five-hour'), snapshot, 10, 'remaining').title, 'Five-Hour Usage');
    assert.equal(testNotificationText(tr, provider('automatic'), snapshot, 10, 'remaining').title, 'Weekly Usage');
    assert.equal(testNotificationText(tr, provider('monthly'), {windows: snapshot.windows.slice(0, 2)}, 10, 'remaining').title, 'Weekly Usage');
    assert.deepEqual(testNotificationText(tr, provider('five-hour'), snapshot, 10, 'remaining'), {
        header: '58% remaining - Codex - Personal | Token Grill',
        title: 'Five-Hour Usage',
        body: 'Test · crossed the 60% remaining milestone',
    });
    assert.equal(testNotificationText(tr, provider('weekly'), snapshot, 25, 'used').body, 'Test · crossed the 50% used milestone');
    assert.equal(testNotificationText(tr, provider('five-hour'), {windows: [{canonicalWindow: 'five-hour', label: '', percent: 0.02}]}, 10, 'used').body,
        'Test · crossed the 10% used milestone', 'below the first step the preview shows the first milestone');
});

test('test notifications without data use preview values and the preferred window', () => {
    assert.equal(testNotificationText(tr, provider('monthly', 'kiro'), null, 10, 'remaining').title, 'Monthly Usage');
    assert.deepEqual(testNotificationText(tr, provider('automatic'), null, 10, 'remaining'), {
        header: '66% remaining - Codex - Personal | Token Grill',
        title: 'Five-Hour Usage',
        body: 'Test · crossed the 70% remaining milestone',
    });
});

test('test notification requests require only bounded provider and nonce strings', () => {
    assert.deepEqual(parseTestNotificationRequest('{"providerId":"account-1","nonce":"unique"}'), {providerId: 'account-1', nonce: 'unique'});
    for (const malformed of ['', '{}', '[]', '{"providerId":"account-1"}', '{"providerId":4,"nonce":"x"}', 'not json'])
        assert.equal(parseTestNotificationRequest(malformed), null);
});
