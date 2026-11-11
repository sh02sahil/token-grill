import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = (await readFile(new URL('../../resources/stylesheet.css', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

const channel = value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const over = (front, back, alpha) => front.map((v, i) => v * alpha + back[i] * (1 - alpha));

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function declared(selector, property) {
    const rule = new RegExp(`(?:^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(rule, `no rule for ${selector}`);
    const value = new RegExp(`${escape(property)}:\\s*(#[0-9a-f]{6})`, 'i').exec(rule[1]);
    assert.ok(value, `no ${property} in ${selector}`);
    return value[1].toLowerCase();
}

const TRACK_ALPHA = 0.25;

test('meter and danger colours meet WCAG contrast in light and dark styles', () => {
    const sets = {
        dark: {
            prefix: '',
            backgrounds: {panel: '#000000', menu: '#36363a'},
            track: '#000000',
        },
        light: {
            prefix: '.tokengrill-light ',
            backgrounds: {panel: '#fafafb', menu: '#fafafb'},
            track: '#fafafb',
        },
    };
    for (const [name, set] of Object.entries(sets)) {
        const {prefix} = set;
        const warning = declared(`${prefix}.tokengrill-panel-meter`, '-tokengrill-warning-color');
        const critical = declared(`${prefix}.tokengrill-panel-meter`, '-tokengrill-critical-color');
        const fill = declared(`${prefix}.slider.tokengrill-meter`, '-barlevel-active-background-color');
        const colours = {warning, critical, fill};
        assert.equal(declared(`${prefix}.slider.tokengrill-meter.tokengrill-warning`, '-barlevel-active-background-color'), warning);
        assert.equal(declared(`${prefix}.slider.tokengrill-meter.tokengrill-critical`, '-barlevel-active-background-color'), critical);
        for (const state of ['warning', 'critical']) {
            assert.equal(declared(`${prefix}.tokengrill-panel-value.tokengrill-${state}`, 'color'), colours[state]);
            assert.equal(declared(`${prefix}.tokengrill-value.tokengrill-${state}`, 'color'), colours[state]);
        }
        for (const [label, hex] of Object.entries(colours)) {
            if (label === 'fill' && name === 'dark')
                assert.equal(hex, '#ffffff');
            for (const [surface, background] of Object.entries(set.backgrounds)) {
                const value = ratio(rgb(hex), rgb(background));
                console.log(`${name} ${label} ${hex} on ${surface}: ${value.toFixed(2)}`);
                assert.ok(value >= 4.5, `${name} ${label} on ${surface} is ${value.toFixed(2)}`);
            }
            const track = over(rgb(fill), rgb(set.track), TRACK_ALPHA);
            const value = ratio(rgb(hex), track);
            console.log(`${name} ${label} ${hex} on track: ${value.toFixed(2)}`);
            assert.ok(value >= 3, `${name} ${label} on the track is ${value.toFixed(2)}`);
        }
    }
});

test('danger colours stay at least 3:1 against their own track tint', () => {
    const sets = {
        dark: {prefix: '', backgrounds: ['#000000', '#36363a', '#1a1a1a']},
        light: {prefix: '.tokengrill-light ', backgrounds: ['#fafafb']},
    };
    for (const [name, {prefix, backgrounds}] of Object.entries(sets)) {
        for (const state of ['warning', 'critical']) {
            const selector = `${prefix}.slider.tokengrill-meter.tokengrill-${state}`;
            const hex = declared(selector, '-barlevel-active-background-color');
            const rule = new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`).exec(css)[1];
            const tint = /-barlevel-background-color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rule);
            assert.ok(tint, `no track colour in ${selector}`);
            assert.deepEqual(tint.slice(1, 4).map(Number), rgb(hex));
            assert.equal(Number(tint[4]), TRACK_ALPHA);
            for (const background of backgrounds) {
                const value = ratio(rgb(hex), over(rgb(hex), rgb(background), TRACK_ALPHA));
                assert.ok(value >= 3, `${name} ${state} on its tint over ${background} is ${value.toFixed(2)}`);
            }
        }
    }
});
