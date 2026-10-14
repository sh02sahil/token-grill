export type ProviderValidationCode = 'required' | 'not-absolute' | 'duplicate-home';

export interface ProviderValidationErrors {
    displayName?: ProviderValidationCode;
    accountHome?: ProviderValidationCode;
    authFileOverride?: ProviderValidationCode;
    sessionsDirectoryOverride?: ProviderValidationCode;
}

export interface ProviderValidationResult {
    valid: boolean;
    errors: ProviderValidationErrors;
}

export interface ProviderDraftPaths {
    id?: string;
    displayName: string;
    accountHome: string;
    authFileOverride?: string | null;
    sessionsDirectoryOverride?: string | null;
}

export interface ExistingProviderPath {
    id: string;
    accountHome: string;
}

type CanonicalizePath = (value: string) => string;

function pathFormatError(value: string): ProviderValidationCode | null {
    const trimmed = value.trim();
    if (!trimmed)
        return 'required';
    if (!trimmed.startsWith('~/') && !trimmed.startsWith('/'))
        return 'not-absolute';
    return null;
}

function optionalPathError(value: string | null | undefined): ProviderValidationCode | null {
    return value?.trim() ? pathFormatError(value) : null;
}

export function validateProviderDraft(
    draft: ProviderDraftPaths,
    providers: ExistingProviderPath[],
    canonicalize: CanonicalizePath
): ProviderValidationResult {
    const errors: ProviderValidationErrors = {};

    if (!draft.displayName.trim())
        errors.displayName = 'required';

    const homeError = pathFormatError(draft.accountHome);
    if (homeError) {
        errors.accountHome = homeError;
    } else {
        const home = canonicalize(draft.accountHome);
        if (providers.some(provider => provider.id !== draft.id && canonicalize(provider.accountHome) === home))
            errors.accountHome = 'duplicate-home';
    }

    const authError = optionalPathError(draft.authFileOverride);
    if (authError)
        errors.authFileOverride = authError;
    const sessionsError = optionalPathError(draft.sessionsDirectoryOverride);
    if (sessionsError)
        errors.sessionsDirectoryOverride = sessionsError;

    return {valid: Object.keys(errors).length === 0, errors};
}

export function firstProviderValidationError(result: ProviderValidationResult): ProviderValidationCode | null {
    const {errors} = result;
    return errors.displayName ?? errors.accountHome ?? errors.authFileOverride ?? errors.sessionsDirectoryOverride ?? null;
}
