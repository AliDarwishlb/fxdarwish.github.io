/**
 * FXDARWISH — Live News aggregator (Cloudflare Worker)
 * ---------------------------------------------------------------
 * Fetches public RSS/Atom feeds server-side (browsers can't: no CORS), parses them,
 * caches each feed at the edge, and returns ONE merged JSON list:
 *   { title, link, source, ts }  -- headline + link only. No article text is copied.
 * No API key needed. Feeds are a fixed list below (nothing user-supplied is fetched).
 * Each feed reports its own status, so one dead feed never breaks the others.
 */
const FEEDS = [
  { id: 'fed',     name: 'Federal Reserve',  url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'fxs',     name: 'FXStreet',         url: 'https://www.fxstreet.com/rss/news' },
  { id: 'il',      name: 'investingLive',    url: 'https://investinglive.com/feed' },
  { id: 'cnbc',    name: 'CNBC Markets',     url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { id: 'mw',      name: 'MarketWatch',      url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
];
const ORIGINS = ['https://fxdarwish.com', 'https://www.fxdarwish.com'];
const FEED_TTL = 180;          // seconds each feed is cached at the edge
const MAX_AGE_MS = 7 * 864e5;  // drop items older than 7 days
const MAX_ITEMS = 120;

export function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
const tag = (b, n) => { const m = b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };

export function parseFeed(xml, sourceName) {
  const out = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const title = decode(tag(b, 'title'));
    let link = decode(tag(b, 'link'));
    if (!link) { const a = b.match(/<link[^>]*href=["']([^"']+)["']/i); link = a ? decode(a[1]) : ''; }
    const when = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const ts = new Date(decode(when));
    if (!title || !/^https?:\/\//i.test(link) || Number.isNaN(ts.getTime())) continue;
    out.push({ title, link, source: sourceName, ts: ts.toISOString() });
  }
  return out;
}

function cors(res, origin) {
  const h = new Headers(res.headers);
  if (ORIGINS.includes(origin)) { h.set('Access-Control-Allow-Origin', origin); h.set('Vary', 'Origin'); }
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function loadFeed(f, ctx) {
  const cache = caches.default;
  const key = new Request(`https://cache.fxdarwish.internal/news/${f.id}`);
  const hit = await cache.match(key);
  if (hit) return { ...(await hit.json()), cached: true };
  try {
    const r = await fetch(f.url, { headers: { 'User-Agent': 'FXDARWISH-News/1.0 (+https://fxdarwish.com)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!r.ok) return { id: f.id, name: f.name, ok: false, error: `HTTP ${r.status}`, items: [] };
    const items = parseFeed(await r.text(), f.name);
    const res = { id: f.id, name: f.name, ok: items.length > 0, error: items.length ? null : 'No readable items', items };
    if (res.ok) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(res), { headers: { 'cache-control': `public, max-age=${FEED_TTL}` } })));
    return res;
  } catch {
    return { id: f.id, name: f.name, ok: false, error: 'Unreachable', items: [] };
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const reply = (r) => cors(r, origin);
    if (request.method === 'OPTIONS') return reply(new Response(null, { status: 204 }));
    if (request.method !== 'GET') return reply(json({ ok: false, error: { code: 'method', message: 'GET only' } }, 405));
    if (origin && !ORIGINS.includes(origin)) return reply(json({ ok: false, error: { code: 'origin', message: 'Origin not allowed' } }, 403));

    const results = await Promise.all(FEEDS.map((f) => loadFeed(f, ctx)));
    const cutoff = Date.now() - MAX_AGE_MS;
    const seen = new Set();
    const items = results.flatMap((r) => r.items)
      .filter((i) => new Date(i.ts).getTime() >= cutoff && new Date(i.ts).getTime() <= Date.now() + 36e5)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .filter((i) => { const k = i.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, MAX_ITEMS);
    return reply(json({
      ok: true,
      data: { items, sources: results.map(({ id, name, ok, error, items: it, cached }) => ({ id, name, ok, error, count: it.length, cached: Boolean(cached) })) },
      meta: { provider: 'Publisher RSS feeds', fetchedAt: new Date().toISOString(), cached: false },
    }));
  },
};
