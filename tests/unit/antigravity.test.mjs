import test from 'node:test';
import assert from 'node:assert/strict';
import {GOOGLE_OAUTH_TOKEN_URL, LOAD_CODE_ASSIST_URL, RETRIEVE_USER_QUOTA_SUMMARY_URL} from '../../build/tests/antigravity-endpoints.mjs';
import {providerIconFile, providerMetadata} from '../../build/tests/provider-metadata.mjs';
import {antigravityPlan, extractQuotaSummaryBuckets, normalizeQuotaSummary} from '../../build/tests/antigravity-normalize.mjs';
import {AGY_KEYRING_ATTRIBUTES, AGY_KEYRING_SCHEMA, parseAgyKeyringPayload} from '../../build/tests/antigravity-keyring-payload.mjs';

test('Antigravity metadata defines five-hour and weekly live quota windows', () => {
    const metadata = providerMetadata('antigravity');
    assert.equal(metadata.label, 'Antigravity');
    assert.equal(metadata.defaultAccent, 'teal');
    assert.equal(metadata.defaultQuotaWindow, 'automatic');
    assert.deepEqual(metadata.quotaWindows, ['five-hour', 'weekly']);
    assert.equal(metadata.localHistorySupported, false);
    assert.equal(providerIconFile('antigravity'), 'antigravity-symbolic.svg');
});

test('Antigravity request endpoints point to the Google Cloud Code APIs', () => {
    assert.equal(GOOGLE_OAUTH_TOKEN_URL, 'https://oauth2.googleapis.com/token');
    assert.equal(LOAD_CODE_ASSIST_URL, 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist');
    assert.equal(RETRIEVE_USER_QUOTA_SUMMARY_URL, 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary');
});

test('Antigravity plan comes from the current tier only', () => {
    assert.equal(antigravityPlan({currentTier: {id: 'standard-tier', name: 'Antigravity Pro'}}), 'Antigravity Pro');
    assert.equal(antigravityPlan({allowedTiers: [], ineligibleTiers: []}), null);
    assert.equal(antigravityPlan(null), null);
});

test('Antigravity CLI keyring entry is addressed by the go-keyring attribute pair', () => {
    assert.deepEqual(AGY_KEYRING_ATTRIBUTES, {service: 'gemini', username: 'antigravity'});
    assert.equal(AGY_KEYRING_SCHEMA, 'org.freedesktop.Secret.Generic');
});

test('Antigravity CLI keyring payload parses the agy token envelope', () => {
    const payload = JSON.stringify({
        token: {
            access_token: 'ya29.access-token-value',
            token_type: 'Bearer',
            refresh_token: '1//refresh-token-value',
            expiry: '2026-09-14T21:49:50.679262266+05:30',
        },
        auth_method: 'consumer',
        id_token: 'eyJhbGciOi.payload.signature',
    });
    assert.deepEqual(parseAgyKeyringPayload(payload), {
        accessToken: 'ya29.access-token-value',
        refreshToken: '1//refresh-token-value',
        expiresAt: Date.parse('2026-09-14T16:19:50.679Z'),
    });
});

test('Antigravity CLI keyring payload rejects unusable entries', () => {
    assert.equal(parseAgyKeyringPayload('not json'), null);
    assert.equal(parseAgyKeyringPayload('[]'), null);
    assert.equal(parseAgyKeyringPayload('{}'), null);
    assert.equal(parseAgyKeyringPayload(JSON.stringify({token: {}})), null);
    assert.equal(parseAgyKeyringPayload(JSON.stringify({token: {refresh_token: 'only-refresh'}})), null);

    const noExpiry = parseAgyKeyringPayload(JSON.stringify({token: {access_token: 'token-value', expiry: 'not-a-date'}}));
    assert.equal(noExpiry.expiresAt, null);
    assert.equal(noExpiry.refreshToken, null);
});

// Shape captured from a live cloudcode-pa retrieveUserQuotaSummary response.
const QUOTA_SUMMARY_PAYLOAD = {
    groups: [
        {
            displayName: 'Gemini Models',
            description: 'Models within this group: Gemini Flash, Gemini Pro',
            buckets: [
                {
                    bucketId: 'gemini-weekly',
                    displayName: 'Weekly Limit Remaining',
                    window: 'weekly',
                    resetTime: '2026-09-14T16:17:29Z',
                    remainingFraction: 0.64553386,
                },
                {
                    bucketId: 'gemini-5h',
                    displayName: 'Five Hour Limit Remaining',
                    window: '5h',
                    resetTime: '2026-09-14T20:42:38Z',
                    remainingFraction: 0.9877525,
                },
            ],
        },
        {
            displayName: 'Claude and GPT models',
            buckets: [
                {
                    bucketId: '3p-weekly',
                    displayName: 'Weekly Limit Remaining',
                    window: 'weekly',
                    resetTime: '2026-09-21T16:05:39Z',
                    remainingFraction: 1,
                },
                {
                    bucketId: '3p-5h',
                    displayName: 'Five Hour Limit Remaining',
                    window: '5h',
                    resetTime: '2026-09-14T21:05:39Z',
                    remainingFraction: 1,
                },
            ],
        },
    ],
};

test('Antigravity quota summary flattens every group bucket', () => {
    const buckets = extractQuotaSummaryBuckets(QUOTA_SUMMARY_PAYLOAD);
    assert.equal(buckets.length, 4);
    assert.deepEqual(buckets[0], {canonicalWindow: 'weekly', remainingFraction: 0.64553386, resetAt: Date.parse('2026-09-14T16:17:29Z')});
    assert.equal(buckets[3].canonicalWindow, 'five-hour');
});

test('Antigravity quota summary reports one overall window per canonical window', () => {
    const windows = normalizeQuotaSummary(QUOTA_SUMMARY_PAYLOAD);
    assert.equal(windows.length, 2);

    const fiveHour = windows.find(w => w.canonicalWindow === 'five-hour');
    assert.equal(fiveHour.id, 'five-hour');
    assert.equal(fiveHour.label, 'Five-hour');
    // Tightest 5h bucket is Gemini at 98.775% remaining -> ~1.2% used.
    assert.equal(Math.round(fiveHour.percent * 10000) / 100, 1.22);
    assert.equal(fiveHour.resetAt, Date.parse('2026-09-14T20:42:38Z'));

    const weekly = windows.find(w => w.canonicalWindow === 'weekly');
    assert.equal(weekly.label, 'Weekly');
    // Tightest weekly bucket is Gemini at 64.55% remaining -> ~35.4% used.
    assert.equal(Math.round(weekly.percent * 100), 35);
    assert.equal(weekly.resetAt, Date.parse('2026-09-14T16:17:29Z'));
});

test('Antigravity quota summary breaks remaining-fraction ties on the earliest reset', () => {
    const payload = {
        groups: [
            {displayName: 'Group A', buckets: [{bucketId: 'a-weekly', window: 'weekly', resetTime: '2026-09-20T00:00:00Z', remainingFraction: 1}]},
            {displayName: 'Group B', buckets: [{bucketId: 'b-weekly', window: 'weekly', resetTime: '2026-09-18T00:00:00Z', remainingFraction: 1}]},
        ],
    };
    const windows = normalizeQuotaSummary(payload);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].resetAt, Date.parse('2026-09-18T00:00:00Z'));
});

test('Antigravity quota summary ignores unknown windows and malformed payloads', () => {
    assert.deepEqual(extractQuotaSummaryBuckets(null), []);
    assert.deepEqual(extractQuotaSummaryBuckets({groups: 'nope'}), []);
    assert.deepEqual(extractQuotaSummaryBuckets({groups: [{buckets: [{window: 'hourly', remainingFraction: 1}]}]}), []);
    assert.deepEqual(extractQuotaSummaryBuckets({groups: [{buckets: [{window: 'weekly', remainingFraction: 'high'}]}]}), []);
    assert.deepEqual(normalizeQuotaSummary(null), []);
});
