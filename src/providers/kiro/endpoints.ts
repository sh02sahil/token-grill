import {CollectorError} from '../../core/errors.js';
import {formatText} from '../../core/i18n.js';

// GetUsageLimits is served by the Amazon Q endpoint of these regions only.
const SERVICE_HOSTS = new Map([
    ['us-east-1', 'codewhisperer.us-east-1.amazonaws.com'],
    ['eu-central-1', 'q.eu-central-1.amazonaws.com'],
    ['us-gov-east-1', 'q.us-gov-east-1.amazonaws.com'],
    ['us-gov-west-1', 'q.us-gov-west-1.amazonaws.com'],
    ['us-iso-east-1', 'q.us-iso-east-1.c2s.ic.gov'],
    ['us-isob-east-1', 'q.us-isob-east-1.sc2s.sgov.gov'],
    ['us-isof-south-1', 'q.us-isof-south-1.csp.hci.ic.gov'],
    ['us-isof-east-1', 'q.us-isof-east-1.csp.hci.ic.gov'],
]);

export const KIRO_SERVICE_HOSTS = [...SERVICE_HOSTS.values()];

export function isKiroServiceRegion(region: string): boolean {
    return SERVICE_HOSTS.has(region);
}

export function kiroUsageUrl(region: string): string {
    const host = SERVICE_HOSTS.get(region);
    if (!host)
        throw new CollectorError('auth-invalid', ({_}) => formatText(_('Kiro usage is not available in the %s region.'), region));
    return `https://${host}/`;
}

export function kiroOidcEndpoint(region: string): string {
    if (!/^[a-z0-9-]+$/.test(region))
        throw new CollectorError('auth-invalid', ({_}) => _('The kiro-cli sign-in names an invalid region.'));
    return `https://oidc.${region}.amazonaws.com/token`;
}

// GetUsageLimits uses the AWS JSON protocol, which reads its parameters from
// the request body. Asking for the e-mail address lets the panel show which
// account kiro-cli is signed in to.
export function kiroUsageRequestBody(profileArn: string | null): Record<string, unknown> {
    return profileArn ? {profileArn, isEmailRequired: true} : {isEmailRequired: true};
}
