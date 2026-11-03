// Data-access layer. The browser never sees an API key: every request goes to the Worker proxy (see config.js).
// Every result carries provenance: { data, meta:{provider, endpoint, fetchedAt, cached, stale} }.

import { API_BASE } from '../config.js';

const listeners = new Set();
export const apiState = { configured: null, lastOk: null, lastError: null, inflight: 0 };
const emit = () => listeners.forEach((f) => f({ ...apiState }));
export const onApiState = (f) => { listeners.add(f); return () => listeners.delete(f); };

export class ApiError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

const MESSAGES = {
  not_configured: 'The proxy has no data-provider key yet. Set the FMP_API_KEY secret on the Worker (see worker/README.md).',
  upstream_auth: 'The data provider rejected the API key.',
  upstream_plan: 'This data is not included in the current provider plan.',
  rate_limited: 'Provider rate limit reached. Retrying shortly will work.',
  upstream: 'The data provider is unavailable right now.',
  network: 'Could not reach the terminal API.',
  empty: 'The provider returned no data for this request.',
};
export const explain = (e) => (e && MESSAGES[e.code]) || (e && e.message) || 'Unknown error';

export async function call(path, params = {}) {
  const q = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, v);
  apiState.inflight++; emit();
  try {
    let r;
    try { r = await fetch(`${API_BASE}/?${q}`); } catch { throw new ApiError('network', MESSAGES.network); }
    let body = null;
    try { body = await r.json(); } catch {}
    if (!body || body.ok !== true) {
      const err = body && body.error ? new ApiError(body.error.code, body.error.message, body.error) : new ApiError('upstream', MESSAGES.upstream);
      if (err.code === 'not_configured') apiState.configured = false;
      apiState.lastError = err.code;
      throw err;
    }
    apiState.configured = true; apiState.lastOk = body.meta.fetchedAt; apiState.lastError = null;
    return body;
  } finally { apiState.inflight--; emit(); }
}

export async function health() {
  try {
    const r = await fetch(`${API_BASE}/?path=_health`);
    const b = await r.json();
    apiState.configured = Boolean(b && b.ok && b.data.configured);
  } catch { apiState.configured = null; apiState.lastError = 'network'; }
  emit();
  return apiState.configured;
}
