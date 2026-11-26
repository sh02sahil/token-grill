import GLib from 'gi://GLib';

import {durationUntil} from './timeMath.js';
import type {ProviderInstance, UsageWindow} from './types.js';

export interface SchedulerJob {
    provider: ProviderInstance;
    manual: boolean;
}

const WAKE_SECONDS = 15;
const RESET_DELAY_MS = 30000;

// Providers are spread over the interval on first sight so accounts sharing a
// service do not all hit it in the same second.
export class Scheduler {
    private _sourceId: number | null = null;
    private _running = false;
    private _paused = false;
    private _providers: ProviderInstance[] = [];
    private readonly _due = new Map<string, number>();
    private readonly _quotaResets = new Map<string, number[]>();
    private readonly _manual = new Set<string>();

    constructor(private readonly _callback: (jobs: SchedulerJob[]) => void, private _intervalSeconds: number) {}

    start(): void {
        if (this._sourceId !== null)
            GLib.Source.remove(this._sourceId);
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, WAKE_SECONDS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    setIntervalSeconds(seconds: number): void {
        this._intervalSeconds = Math.max(60, Math.min(seconds, 3600));
    }

    setProviders(providers: ProviderInstance[]): void {
        this._providers = providers;
        const liveProviders = new Set(providers.filter(provider => provider.enabled && provider.liveUsageEnabled).map(provider => provider.id));
        for (const id of this._quotaResets.keys()) {
            if (!liveProviders.has(id))
                this._quotaResets.delete(id);
        }
        const now = Date.now();
        for (const provider of providers) {
            if (!this._due.has(provider.id))
                this._due.set(provider.id, now + Math.random() * this._intervalSeconds * 1000);
        }
    }

    setQuotaResets(providerId: string, windows: readonly Pick<UsageWindow, 'resetAt'>[], fetchedAt: number): void {
        const due = new Set<number>();
        for (const {resetAt} of windows) {
            const reset = durationUntil(resetAt, fetchedAt);
            if (reset && reset.timestamp + RESET_DELAY_MS > fetchedAt)
                due.add(reset.timestamp + RESET_DELAY_MS);
        }
        if (due.size)
            this._quotaResets.set(providerId, [...due].sort((first, second) => first - second));
        else
            this.clearQuotaResets(providerId);
    }

    clearQuotaResets(providerId: string): void {
        this._quotaResets.delete(providerId);
    }

    setPaused(paused: boolean): void {
        this._paused = paused;
    }

    // Returns false while paused, when nothing is queued.
    refresh(providerIds: string[]): boolean {
        if (this._paused)
            return false;
        const now = Date.now();
        for (const id of providerIds) {
            this._manual.add(id);
            this._due.set(id, now);
        }
        this._tick();
        return true;
    }

    complete(): void {
        this._running = false;
        this._tick();
    }

    destroy(): void {
        if (this._sourceId !== null)
            GLib.Source.remove(this._sourceId);
        this._sourceId = null;
        this._due.clear();
        this._quotaResets.clear();
        this._manual.clear();
        this._providers = [];
    }

    private _tick(): void {
        if (this._running || this._paused)
            return;
        const now = Date.now();
        const jobs: SchedulerJob[] = [];
        for (const provider of this._providers) {
            if (!provider.enabled)
                continue;
            const resets = this._quotaResets.get(provider.id);
            const resetDue = resets && resets[0]! <= now;
            if (!resetDue && (this._due.get(provider.id) ?? Infinity) > now)
                continue;
            if (resetDue) {
                const upcoming = resets.filter(due => due > now);
                if (upcoming.length)
                    this._quotaResets.set(provider.id, upcoming);
                else
                    this.clearQuotaResets(provider.id);
            }
            jobs.push({provider, manual: this._manual.delete(provider.id)});
            this._due.set(provider.id, now + this._intervalSeconds * 1000);
        }
        if (jobs.length === 0)
            return;
        this._running = true;
        this._callback(jobs);
    }
}
