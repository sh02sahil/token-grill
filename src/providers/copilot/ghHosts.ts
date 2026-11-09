// The GitHub CLI's hosts.yml: the active user of github.com, and its token when
// gh was told to store it in plain text instead of the keyring.
const HOST = 'github.com:';

export interface GhHosts {
    user: string | null;
    token: string | null;
}

export function parseGhHosts(text: string): GhHosts {
    let inHost = false;
    let user: string | null = null;
    let token: string | null = null;
    for (const line of text.split('\n')) {
        if (!line.startsWith(' ')) {
            inHost = line.trim() === HOST;
            continue;
        }
        // Only the host's own keys, indented one level; per-user entries sit deeper.
        const match = inHost ? line.match(/^ {4}(user|oauth_token):\s*(\S+)\s*$/) : null;
        if (match?.[1] === 'user')
            user = match[2] ?? null;
        else if (match?.[1] === 'oauth_token')
            token = match[2] ?? null;
    }
    return {user, token};
}
