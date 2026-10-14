import {CollectorError} from '../../core/errors.js';
import {parseRecord, stringAt, toEpochMs} from '../../core/json.js';
import {isKiroServiceRegion} from './endpoints.js';

// A token this close to expiry is refreshed first, so it cannot expire in flight.
const TOKEN_SKEW_MS = 60 * 1000;
// Builder ID sign-ins carry no profile and are served from us-east-1.
const DEFAULT_SERVICE_REGION = 'us-east-1';

export interface KiroAuth {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
    region: string;
    serviceRegion: string;
    clientId: string | null;
    clientSecret: string | null;
    clientSecretExpiresAt: number | null;
    profileArn: string | null;
}

export interface KiroAuthRecords {
    token: string | null;
    registration: string | null;
    profile: string | null;
}

function invalidRecord(): CollectorError {
    return new CollectorError('auth-invalid', ({_}) => _('The kiro-cli sign-in data could not be read.'));
}

export function parseKiroAuthRecords(records: KiroAuthRecords): KiroAuth {
    if (!records.token)
        throw new CollectorError('auth-missing', ({_}) => _('kiro-cli is not signed in.'));
    const token = parseRecord(records.token);
    const registration = records.registration ? parseRecord(records.registration) : {};
    if (!token || !registration)
        throw invalidRecord();
    const accessToken = stringAt(token, 'access_token');
    const region = stringAt(token, 'region') ?? stringAt(registration, 'region');
    const expiresAt = toEpochMs(token.expires_at);
    if (!accessToken)
        throw new CollectorError('auth-missing', ({_}) => _('kiro-cli is not signed in.'));
    if (!region || expiresAt === null)
        throw invalidRecord();
    const profile = records.profile ? parseRecord(records.profile) : null;
    const profileArn = profile ? stringAt(profile, 'arn') : null;
    const arnRegion = profileArn?.split(':')[3] ?? '';
    let serviceRegion = DEFAULT_SERVICE_REGION;
    if (isKiroServiceRegion(arnRegion))
        serviceRegion = arnRegion;
    else if (isKiroServiceRegion(region))
        serviceRegion = region;
    return {
        accessToken,
        refreshToken: stringAt(token, 'refresh_token'),
        expiresAt,
        region,
        serviceRegion,
        clientId: stringAt(registration, 'client_id'),
        clientSecret: stringAt(registration, 'client_secret'),
        clientSecretExpiresAt: toEpochMs(registration.client_secret_expires_at),
        profileArn,
    };
}

export function isKiroTokenFresh(auth: Pick<KiroAuth, 'expiresAt'>, now = Date.now()): boolean {
    return auth.expiresAt > now + TOKEN_SKEW_MS;
}

export function isKiroRefreshable(auth: KiroAuth, now = Date.now()): boolean {
    const registrationValid = auth.clientSecretExpiresAt === null || auth.clientSecretExpiresAt > now;
    return Boolean(auth.refreshToken && auth.clientId && auth.clientSecret) && registrationValid;
}
