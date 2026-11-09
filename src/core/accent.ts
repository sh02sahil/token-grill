import type {AccentColor, AccentValue} from './types.js';

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

const CUSTOM_ACCENT = /^#[0-9a-f]{6}$/i;

function isPaletteName(value: string): value is AccentColor {
    return Object.hasOwn(ACCENT_COLORS, value);
}

export function normalizeAccent(value: unknown, fallback: AccentColor): AccentValue {
    if (typeof value !== 'string')
        return fallback;
    if (isPaletteName(value))
        return value;
    if (CUSTOM_ACCENT.test(value))
        return value.toLowerCase() as AccentValue;
    return LEGACY_ACCENTS[value] || fallback;
}

export function accentHex(accent: AccentValue): string {
    return isPaletteName(accent) ? ACCENT_COLORS[accent] : accent;
}

// Custom colours have no style class; they are drawn from accentHex().
export function accentStyleClass(accent: AccentValue): string {
    const normalized = normalizeAccent(accent, 'blue');
    return `tokengrill-accent-${isPaletteName(normalized) ? normalized : 'custom'}`;
}
