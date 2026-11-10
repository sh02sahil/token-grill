import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {accentHex} from '../core/accent.js';
import {providerIconFile} from '../core/providerMetadata.js';
import type {ProviderInstance, ProviderKind} from '../core/types.js';

const MARK_DOT_SIZE = 6;

export function providerGicon(extensionPath: string, kind: ProviderKind): Gio.Icon {
    return Gio.icon_new_for_string(`${extensionPath}/icons/providers/${providerIconFile(kind)}`);
}

export function providerIcon(extensionPath: string, kind: ProviderKind, size: number): St.Icon {
    return new St.Icon({
        gicon: providerGicon(extensionPath, kind),
        icon_size: size,
        style_class: 'tokengrill-provider-icon',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

// A small dot in the account's colour.  It always sits next to the account
// name or icon, so colour is never the only way to tell accounts apart.  The
// colour is the user's own choice, so it is drawn rather than styled (UI-10).
export function accentDot(instance: Pick<ProviderInstance, 'accent'>, size: number): St.DrawingArea {
    const value = Number.parseInt(accentHex(instance.accent).slice(1), 16);
    const area = new St.DrawingArea({width: size, height: size, y_align: Clutter.ActorAlign.CENTER});
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        cr.setSourceRGBA((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255, 1);
        cr.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
        cr.fill();
        cr.$dispose();
    });
    return area;
}

export function providerMark(extensionPath: string, instance: ProviderInstance, size: number): St.Widget {
    // Fixed positioning is intentional. BinLayout expands children by default,
    // which distorted the accent dot and pulled the icon off centre.
    const mark = new St.Widget({
        width: size,
        height: size,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        y_expand: false,
        layout_manager: new Clutter.FixedLayout(),
        style_class: 'tokengrill-provider-mark',
    });
    const iconSize = Math.max(12, size - 4);
    const icon = providerIcon(extensionPath, instance.kind, iconSize);
    const offset = Math.floor((size - iconSize) / 2);
    icon.set_position(offset, offset);
    mark.add_child(icon);
    const dot = accentDot(instance, MARK_DOT_SIZE);
    dot.set_position(size - MARK_DOT_SIZE, size - MARK_DOT_SIZE);
    mark.add_child(dot);
    return mark;
}
