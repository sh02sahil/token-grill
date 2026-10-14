import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {displayPath} from '../core/paths.js';
import {dataPath, statePath} from '../storage/atomicJson.js';

export class DataPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({GTypeName: 'TokenGrillDataPage'}, this);
    }

    constructor() {
        super({title: _('Data'), icon_name: 'folder-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: _('Local Data'),
            description: _('Only compact aggregates and checkpoints are stored; logs of the services are never modified'),
        });
        group.add(new Adw.ActionRow({
            title: _('Usage History'),
            subtitle: displayPath(dataPath('history-v1.json')),
            subtitle_selectable: true,
        }));
        group.add(new Adw.ActionRow({
            title: _('Parser Checkpoints'),
            subtitle: displayPath(statePath('checkpoints-v1.json')),
            subtitle_selectable: true,
        }));
        this.add(group);
    }
}
