import type {AccentColor} from './types.js';

// GNOME's accent palette (libadwaita Adw.AccentColor.to_rgba), so account
// markers match the colours users already know from Settings → Appearance.
// The Shell draws them from stylesheet.css; preferences uses these values.
export const ACCENT_COLORS: Record<AccentColor, string> = {
    blue: '#3584e4',
    teal: '#2190a4',
    green: '#3a944a',
    yellow: '#c88800',
    orange: '#ed5b00',
    red: '#e62d42',
    pink: '#d56199',
    purple: '#9141ac',
    slate: '#6f8396',
};

// Accent names used before the switch to the GNOME palette.
const LEGACY_ACCENTS: Record<string, AccentColor> = {cyan: 'teal', amber: 'yellow'};

export function normalizeAccent(value: unknown, fallback: AccentColor): AccentColor {
    if (typeof value !== 'string')
        return fallback;
    if (value in ACCENT_COLORS)
        return value as AccentColor;
    return LEGACY_ACCENTS[value] || fallback;
}

export function accentStyleClass(accent: AccentColor): string {
    return `tokengrill-accent-${normalizeAccent(accent, 'blue')}`;
}
