import type Gio from 'gi://Gio';

import type {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {selectWindow} from '../core/display.js';
import {
    clampStep,
    milestoneNotificationText,
    notificationBucket,
    shouldNotifyMilestone,
    testNotificationText,
    type NotificationText,
} from '../core/notificationPolicy.js';
import type {PanelPercentageMode, ProviderInstance, ProviderSnapshot} from '../core/types.js';
import {readJson, SerialWriter, statePath} from '../storage/atomicJson.js';
import {providerGicon} from './accountChip.js';
import {TRANSLATOR} from './translator.js';

interface WindowState {
    providerId: string;
    resetIdentity: string;
    lastNotifiedBucket: number;
    configuredStep: number;
}

interface NotificationState {
    schemaVersion: 2;
    windows: Record<string, WindowState>;
}

function emptyState(): NotificationState {
    return {schemaVersion: 2, windows: {}};
}

// One message-tray source per account, so each alert carries the account's name and icon.
export class NotificationStore {
    private readonly _extension: Extension;
    private readonly _writer = new SerialWriter(statePath('notifications-v1.json'));
    private readonly _sources = new Map<string, MessageTray.Source>();
    private _state = emptyState();

    constructor(extension: Extension) {
        this._extension = extension;
    }

    async initialize(cancellable: Gio.Cancellable): Promise<void> {
        const loaded = await readJson<Partial<NotificationState> | null>(this._writer.path, null, cancellable, this._extension.getLogger());
        if (loaded?.schemaVersion === 2 && loaded.windows && typeof loaded.windows === 'object')
            this._state = {schemaVersion: 2, windows: loaded.windows};
    }

    notifyMilestones(instance: ProviderInstance, snapshot: ProviderSnapshot, stepPercent: number, mode: PanelPercentageMode): void {
        if (snapshot.state === 'error' || snapshot.state === 'disabled')
            return;
        const window = selectWindow(snapshot, instance.panelWindowPreference);
        if (window?.percent == null)
            return;
        const step = clampStep(stepPercent);
        const consumed = Math.max(0, Math.min(1, window.percent));
        const bucket = notificationBucket(consumed, step);
        const resetIdentity = `${window.canonicalWindow}:${window.resetAt ?? 'unknown'}`;
        const key = `${instance.id}:selected-limit`;
        const previous = this._state.windows[key] ?? null;
        const notify = shouldNotifyMilestone(previous, resetIdentity, bucket, step);
        const carried = previous?.resetIdentity === resetIdentity ? previous.lastNotifiedBucket : 0;
        const next: WindowState = {
            providerId: instance.id,
            resetIdentity,
            lastNotifiedBucket: Math.max(bucket, carried),
            configuredStep: step,
        };
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
            this._state.windows[key] = next;
            this._persist();
        }
        if (notify)
            this._show(instance, milestoneNotificationText(TRANSLATOR, instance, window, consumed, bucket * step, mode));
    }

    notifyTest(instance: ProviderInstance, snapshot: ProviderSnapshot | null, stepPercent: number, mode: PanelPercentageMode): void {
        this._show(instance, testNotificationText(TRANSLATOR, instance, snapshot, stepPercent, mode));
    }

    removeProvider(providerId: string): void {
        const keys = Object.keys(this._state.windows).filter(key => this._state.windows[key]?.providerId === providerId);
        for (const key of keys)
            delete this._state.windows[key];
        if (keys.length)
            this._persist();
        this._sources.get(providerId)?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    }

    flush(): Promise<void> {
        return this._writer.flush(() => this._state);
    }

    destroy(): void {
        for (const source of [...this._sources.values()])
            source.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this._sources.clear();
    }

    private _persist(): void {
        this._writer.markDirty();
        this.flush().catch(error => this._extension.getLogger().warn(error));
    }

    // The banner shows the source title as its header, so each alert retitles
    // the account's source. Alerts are transient, so no older entry keeps a stale header.
    private _sourceFor(instance: ProviderInstance, header: string): MessageTray.Source {
        const icon = providerGicon(this._extension.path, instance.kind);
        const existing = this._sources.get(instance.id);
        if (existing) {
            existing.title = header;
            existing.icon = icon;
            return existing;
        }
        const source = new MessageTray.Source({title: header, icon});
        source.connect('destroy', () => this._sources.delete(instance.id));
        this._sources.set(instance.id, source);
        Main.messageTray.add(source);
        return source;
    }

    private _show(instance: ProviderInstance, text: NotificationText): void {
        const source = this._sourceFor(instance, text.header);
        source.addNotification(new MessageTray.Notification({source, title: text.title, body: text.body, isTransient: true}));
    }
}
