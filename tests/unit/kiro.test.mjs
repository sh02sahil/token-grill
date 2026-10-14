import test from 'node:test';
import assert from 'node:assert/strict';
import {kiroOidcEndpoint, kiroUsageRequestBody, kiroUsageUrl} from '../../build/tests/kiro-endpoints.mjs';
import {KiroRejectedTokens, kiroUsageError} from '../../build/tests/kiro-usage-policy.mjs';
import {normalizeKiroUsage} from '../../build/tests/kiro-normalize.mjs';
import {CollectorError, httpError, providerErrorInfo, serviceErrorReason} from '../../build/tests/errors.mjs';
import {UNTRANSLATED} from '../../build/tests/i18n.mjs';
import {providerIconFile, providerMetadata} from '../../build/tests/provider-metadata.mjs';
import {isKiroRefreshable, isKiroTokenFresh, parseKiroAuthRecords} from '../../build/tests/kiro-auth-records.mjs';

const text = message => () => message;

test('Kiro metadata defines monthly-only live quota defaults', () => {
    const metadata = providerMetadata('kiro');
    assert.equal(metadata.label, 'Kiro');
    assert.equal(metadata.defaultAccent, 'purple');
    assert.equal(metadata.defaultQuotaWindow, 'monthly');
    assert.deepEqual(metadata.quotaWindows, ['monthly']);
    assert.equal(metadata.localHistorySupported, false);
    assert.equal(providerIconFile('kiro'), 'kiro-symbolic.svg');
});

test('Kiro request URLs cover commercial, GovCloud and ISO partitions', () => {
    assert.equal(kiroOidcEndpoint('us-east-1'), 'https://oidc.us-east-1.amazonaws.com/token');
    assert.equal(kiroUsageUrl('us-east-1'), 'https://codewhisperer.us-east-1.amazonaws.com/');
    assert.equal(kiroUsageUrl('eu-central-1'), 'https://q.eu-central-1.amazonaws.com/');
    assert.equal(kiroUsageUrl('us-gov-west-1'), 'https://q.us-gov-west-1.amazonaws.com/');
    assert.equal(kiroUsageUrl('us-iso-east-1'), 'https://q.us-iso-east-1.c2s.ic.gov/');
    assert.throws(() => kiroUsageUrl('ap-south-1'), error => error.code === 'auth-invalid');
    assert.throws(() => kiroOidcEndpoint('us-east-1.evil.example/'), error => error.code === 'auth-invalid');
});

test('Kiro usage request sends its parameters in the JSON body', () => {
    assert.deepEqual(kiroUsageRequestBody(null), {isEmailRequired: true});
    assert.deepEqual(kiroUsageRequestBody('arn:aws:codewhisperer:us-east-1:1:profile/a b'), {
        profileArn: 'arn:aws:codewhisperer:us-east-1:1:profile/a b',
        isEmailRequired: true,
    });
});

test('Kiro FEATURE_NOT_SUPPORTED becomes an account error rather than a generic auth failure', () => {
    const mapped = kiroUsageError(httpError(403, 'FEATURE_NOT_SUPPORTED'));
    assert.equal(mapped.code, 'unsupported-account');
    assert.match(mapped.message, /without Kiro usage/);
    const info = providerErrorInfo(mapped, UNTRANSLATED);
    assert.equal(info.code, 'unsupported-account');
    assert.equal(info.recovery, 'reauthenticate');
    const other = httpError(401, null);
    assert.equal(other.code, 'auth-invalid');
    assert.equal(kiroUsageError(other), other);
});

test('Kiro remembers persistent rejections per instance and per stored token only', () => {
    const rejected = new KiroRejectedTokens();
    const error = new CollectorError('unsupported-account', text('no usage'));
    assert.equal(rejected.remember('instance-c', 'token-9', httpError(401, null)), false, 'a plain 401 may be fixed by refreshing the token');
    assert.equal(rejected.remember('instance-a', 'token-1', error), true);
    assert.equal(rejected.get('instance-a', 'token-1'), error);
    assert.equal(rejected.get('instance-a', 'token-2'), null, 'a new kiro-cli token is always re-checked');
    assert.equal(rejected.get('instance-b', 'token-1'), null, 'instances with separate homes never share state');
    rejected.forget('instance-a');
    assert.equal(rejected.get('instance-a', 'token-1'), null);
    assert.equal(rejected.remember('instance-a', 'token-3', new CollectorError('offline', text('offline'))), false, 'transient failures are retried');
});

test('Kiro usage reports the account email returned by the service', () => {
    const result = normalizeKiroUsage({
        usageBreakdownList: [{resourceType: 'CREDIT', currentUsageWithPrecision: 4042.73, usageLimitWithPrecision: 5000, nextDateReset: 1793491200}],
        subscriptionInfo: {subscriptionTitle: 'KIRO PRO MAX'},
        userInfo: {email: 'someone@example.com', userId: 'd-1.abc'},
    });
    assert.equal(result.account, 'someone@example.com');
    assert.equal(result.plan, 'KIRO PRO MAX');
    assert.equal(normalizeKiroUsage({usageBreakdownList: [{resourceType: 'CREDIT', currentUsage: 1, usageLimit: 2}]}).account, null);
});

test('Kiro credential records parse expiry, refresh material, and profile ARN', () => {
    const auth = parseKiroAuthRecords({
        token: JSON.stringify({access_token: 'access-value', refresh_token: 'refresh-value', expires_at: 1800000000, region: 'us-east-1'}),
        registration: JSON.stringify({client_id: 'client-value', client_secret: 'secret-value', client_secret_expires_at: 1900000000}),
        profile: JSON.stringify({arn: 'arn:aws:codewhisperer:us-east-1:1:profile/test', profile_name: 'test'}),
    });
    assert.equal(auth.expiresAt, 1800000000000);
    assert.equal(auth.clientSecretExpiresAt, 1900000000000);
    assert.equal(auth.profileArn, 'arn:aws:codewhisperer:us-east-1:1:profile/test');
    assert.equal(auth.region, 'us-east-1');
    assert.equal(auth.serviceRegion, 'us-east-1');
    assert.equal(isKiroTokenFresh(auth, 1700000000000), true);
    assert.equal(isKiroTokenFresh({...auth, expiresAt: 1700000059999}, 1700000000000), false);
    assert.equal(isKiroRefreshable(auth, 1700000000000), true);
    assert.equal(isKiroRefreshable(auth, 1900000000001), false, 'an expired device registration cannot refresh');
});

test('Kiro separates the OIDC login region from the profile service region', () => {
    const auth = parseKiroAuthRecords({
        token: JSON.stringify({access_token: 'access', expires_at: 1800000000, region: 'ap-south-1'}),
        registration: null,
        profile: JSON.stringify({arn: 'arn:aws:codewhisperer:eu-central-1:1:profile/test'}),
    });
    assert.equal(auth.region, 'ap-south-1');
    assert.equal(auth.serviceRegion, 'eu-central-1');
    assert.equal(isKiroRefreshable(auth), false);
});

test('Kiro credential errors never include stored secret values', () => {
    const secret = 'do-not-leak-this-secret';
    assert.throws(() => parseKiroAuthRecords({token: '{malformed', registration: JSON.stringify({client_secret: secret}), profile: null}), error => {
        assert.doesNotMatch(error.message, new RegExp(secret));
        assert.equal(error.code, 'auth-invalid');
        return true;
    });
    assert.throws(() => parseKiroAuthRecords({token: null, registration: null, profile: null}), error => error.code === 'auth-missing');
});

test('Service error reasons are extracted safely from AWS and OAuth error bodies', () => {
    assert.equal(serviceErrorReason('{"__type":"com.amazon.aws.codewhisperer#AccessDeniedException","message":"FEATURE_NOT_SUPPORTED","reason":"FEATURE_NOT_SUPPORTED"}'), 'FEATURE_NOT_SUPPORTED');
    assert.equal(serviceErrorReason('{"__type":"com.amazon.aws.codewhisperer#AccessDeniedException","message":"User is not authorized."}'), 'AccessDeniedException');
    assert.equal(serviceErrorReason('{"error":"invalid_grant","error_description":"Invalid refresh token"}'), 'invalid_grant');
    assert.equal(serviceErrorReason('{"reason":"contains a secret value aoaAAAA and spaces"}'), null, 'free text is never surfaced');
    assert.equal(serviceErrorReason('not json'), null);
    assert.equal(serviceErrorReason(''), null);
});

test('HTTP errors map rate limits and rejected sign-ins to their own codes', () => {
    assert.equal(httpError(429, null).code, 'rate-limited');
    assert.equal(httpError(401, null).code, 'auth-invalid');
    assert.equal(httpError(403, 'PERMISSION_DENIED').code, 'auth-invalid');
    assert.equal(httpError(500, null).code, 'http');
    assert.equal(providerErrorInfo(httpError(429, null), UNTRANSLATED).recovery, 'retry');
});
