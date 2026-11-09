import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {accentStyleClass} from '../core/accent.js';
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

// A small dot in the account's GNOME accent colour.  It always sits next to
// the account name or icon, so colour is never the only way to tell accounts apart.
export function accentDot(instance: Pick<ProviderInstance, 'accent'>, size: number): St.Widget {
    return new St.Widget({
        width: size,
        height: size,
        style_class: `tokengrill-account-dot ${accentStyleClass(instance.accent)}`,
        y_align: Clutter.ActorAlign.CENTER,
    });
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
