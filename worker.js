/**
 * FXDARWISH — Economic Calendar proxy (Cloudflare Worker)
 * ------------------------------------------------------------------
 * Why this exists:
 *   • Browsers can't fetch the Forex Factory feed directly (no CORS).
 *   • Forex Factory rate-limits repeated "calendar export" requests.
 * This Worker fetches the feed server-side, caches it at Cloudflare's
 * edge for 1 hour (so FF sees very few requests), and returns it with
 * CORS headers so calendar.html can read it.
 *
 * Deploy:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file, click Deploy
 *   3. Copy the *.workers.dev URL it gives you
 *   4. In calendar.html set:  var WORKER_URL = 'https://<that-url>';
 *
 * Usage from the page:
 *   GET  https://<worker>/?range=thisweek   (default)
 *   GET  https://<worker>/?range=nextweek
 */

const FEEDS = {
  thisweek: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  nextweek: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

// Only these origins may read the response. Add/remove as needed.
// (A local "file://" page sends Origin: null and will fall back to the
// first entry, which is harmless for a read-only public calendar.)
const ALLOWED_ORIGINS = [
  'https://fxdarwish.com',
  'https://www.fxdarwish.com',
];

const CACHE_SECONDS = 3600; // 1 hour

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), request);
    }

    const url = new URL(request.url);
    const range = url.searchParams.get('range') === 'nextweek' ? 'nextweek' : 'thisweek';
    const target = FEEDS[range];

    try {
      const upstream = await fetch(target, {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        headers: { 'User-Agent': 'FXDARWISH-Calendar/1.0' },
      });

      const body = await upstream.text();

      // FF returns an HTML "Request Denied" page when rate-limited.
      if (body.trim().charAt(0) === '<') {
        return withCors(json({ error: 'rate_limited' }, 503), request);
      }

      return withCors(new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=1800',
        },
      }), request);
    } catch (err) {
      return withCors(json({ error: 'fetch_failed' }, 502), request);
    }
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function withCors(res, request) {
  const origin = request && request.headers.get('Origin');
  const allow = ALLOWED_ORIGINS.indexOf(origin) > -1 ? origin : ALLOWED_ORIGINS[0];
  res.headers.set('Access-Control-Allow-Origin', allow);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}
