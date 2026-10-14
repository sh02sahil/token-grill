import type {ProviderSnapshot} from './types.js';

// A stable, deliberately small representation of the data users care about.
// Fetch times, errors, and refresh state are excluded so a successful check
// with identical values is correctly reported as "no change".
export function snapshotFingerprint(snapshot: ProviderSnapshot | null): string {
    if (!snapshot)
        return '';

    return JSON.stringify({
        plan: snapshot.plan,
        account: snapshot.account ?? null,
        windows: snapshot.windows,
        resetCredits: snapshot.resetCredits ? {
            availableCount: snapshot.resetCredits.availableCount,
            credits: snapshot.resetCredits.credits,
        } : null,
        totals: snapshot.totals,
        todayTotals: snapshot.todayTotals,
        monthTotals: snapshot.monthTotals,
        todayCost: snapshot.todayCost,
        monthCost: snapshot.monthCost,
    });
}
