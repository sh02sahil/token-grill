import Gio from 'gi://Gio';

import {isRecord} from '../core/json.js';

export interface ModelRate {
    input: number;
    output: number;
    cachedInput?: number;
    cacheWrite?: number;
}

export type PricingCatalog = Record<string, ModelRate>;

// The catalog ships with the extension; without it costs are simply not shown.
export async function loadCatalog(path: string, cancellable: Gio.Cancellable): Promise<PricingCatalog> {
    const [contents] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    const payload: unknown = JSON.parse(new TextDecoder().decode(contents));
    return isRecord(payload) && isRecord(payload.models) ? payload.models as PricingCatalog : {};
}
