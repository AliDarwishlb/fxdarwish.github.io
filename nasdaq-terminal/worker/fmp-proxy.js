/**
 * FXDARWISH — NASDAQ Terminal data proxy (Cloudflare Worker)
 * ---------------------------------------------------------------
 * Holds the Financial Modeling Prep key as a Worker secret (FMP_API_KEY),
 * so it never appears in the repo or the browser.
 *
 * - Endpoint allowlist + parameter validation (nothing else can be proxied)
 * - Edge caching per endpoint (TTL below) via the Workers Cache API
 * - Approximate upstream rate limit (per isolate; Cloudflare may run several)
 * - CORS limited to fxdarwish.com. Note: CORS stops OTHER WEBSITES from using this
 *   in a browser; it can't stop a script calling the Worker directly. Caching and the
 *   rate limit bound the cost; you can also set a hard cap at your FMP plan.
 * - Every response carries provenance meta { provider, endpoint, fetchedAt, cached }
 */
const BASE = 'https://financialmodelingprep.com/stable/';

const ALLOW = {
  'batch-quote': 15,
  'batch-index-quotes': 15,
  'quote': 15,
  'nasdaq-constituent': 6 * 3600,
  'sector-performance-snapshot': 120,
  'search-symbol': 600,
  'profile': 24 * 3600,
};
const PARAMS = new Set(['symbol', 'symbols', 'query', 'date', 'limit', 'exchange']);
const VALUE_RE = /^[\w.,^\-\s]{1,2000}$/;
const ORIGINS = ['https://fxdarwish.com', 'https://www.fxdarwish.com'];

let stamps = [];
function rateWait(rpm) {
  const now = Date.now();
  stamps = stamps.filter((t) => now - t < 60000);
  if (stamps.length >= rpm) return Math.ceil((60000 - (now - stamps[0])) / 1000);
  stamps.push(now);
  return 0;
}

function cors(res, origin) {
  const h = new Headers(res.headers);
  if (ORIGINS.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
  }
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const fail = (status, code, message, extra = {}) => json({ ok: false, error: { code, message, ...extra } }, status);

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const reply = (r) => cors(r, origin);

    if (request.method === 'OPTIONS') return reply(new Response(null, { status: 204 }));
    if (request.method !== 'GET') return reply(fail(405, 'method', 'GET only'));
    // Browsers always send Origin on cross-site calls: refuse other sites outright.
    if (origin && !ORIGINS.includes(origin)) return reply(fail(403, 'origin', 'Origin not allowed'));

    const url = new URL(request.url);
    const path = url.searchParams.get('path') || '';

    if (path === '_health') return reply(json({ ok: true, data: { configured: Boolean(env.FMP_API_KEY), provider: 'Financial Modeling Prep' } }));
    if (!(path in ALLOW)) return reply(fail(403, 'forbidden', `Endpoint not allowed: ${path}`));
    if (!env.FMP_API_KEY) return reply(fail(503, 'not_configured', 'FMP_API_KEY secret is not set on the Worker.'));

    const q = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (k === 'path') continue;
      if (!PARAMS.has(k) || !VALUE_RE.test(v)) return reply(fail(400, 'bad_param', `Invalid parameter: ${k}`));
      q.set(k, v);
    }
    q.sort();

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.fxdarwish.internal/${path}?${q}`);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.json();
      return reply(json({ ...body, meta: { ...body.meta, cached: true } }));
    }

    const wait = rateWait(Number(env.FMP_RPM || 120));
    if (wait) return reply(fail(429, 'rate_limited', 'Upstream rate limit reached.', { retryAfter: wait }));

    try {
      const upstream = new URL(BASE + path);
      q.forEach((v, k) => upstream.searchParams.set(k, v));
      upstream.searchParams.set('apikey', env.FMP_API_KEY);
      const r = await fetch(upstream, { headers: { Accept: 'application/json' } });
      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!r.ok || data === null || (data && data['Error Message'])) {
        const code = r.status === 401 || r.status === 403 ? 'upstream_auth' : r.status === 402 ? 'upstream_plan' : 'upstream';
        return reply(fail(502, code, `Provider returned ${r.status}`, { upstreamStatus: r.status }));
      }
      const body = { ok: true, data, meta: { provider: 'Financial Modeling Prep', endpoint: path, fetchedAt: new Date().toISOString(), cached: false, ttl: ALLOW[path] } };
      ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ALLOW[path]}` } })));
      return reply(json(body));
    } catch {
      return reply(fail(502, 'upstream', 'Could not reach the data provider.'));
    }
  },
};
