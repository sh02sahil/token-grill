import {gettext, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import type {Translator} from '../core/i18n.js';

// Lets the GNOME-free text producers in core/ translate with the extension's domain.
export const TRANSLATOR: Translator = {_: gettext, ngettext};
