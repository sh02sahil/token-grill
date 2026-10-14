// Core modules stay free of GNOME imports so they can run under node tests.
// Callers in the Shell and preferences pass in the real gettext functions;
// strings stay extractable because every call site uses `_()` / `ngettext()`.
export interface Translator {
    _: (text: string) => string;
    ngettext: (singular: string, plural: string, count: number) => string;
}

export const UNTRANSLATED: Translator = {
    _: text => text,
    ngettext: (singular, plural, count) => count === 1 ? singular : plural,
};

// Replaces `%s` / `%d` placeholders in order, matching GJS String.prototype.format.
export function formatText(template: string, ...values: Array<string | number>): string {
    let index = 0;
    return template.replace(/%[sd%]/g, token => {
        if (token === '%%')
            return '%';
        return String(values[index++] ?? '');
    });
}
