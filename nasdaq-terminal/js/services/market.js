// Market-data service: normalizes provider payloads. Missing values stay null (never invented).
import { call } from './api.js';

export const INDEX_DEFS = [
  { key: 'COMP', label: 'NASDAQ Composite', symbols: ['^IXIC'], src: 'index' },
  { key: 'NDX', label: 'NASDAQ-100', symbols: ['^NDX'], src: 'index' },
  { key: 'QQQ', label: 'QQQ ETF', symbols: ['QQQ'], src: 'quote' },
  { key: 'SPX', label: 'S&P 500', symbols: ['^GSPC'], src: 'index' },
  { key: 'DJI', label: 'Dow Jones', symbols: ['^DJI'], src: 'index' },
  { key: 'VIX', label: 'VIX', symbols: ['^VIX'], src: 'index' },
  { key: 'TNX', label: 'US 10Y Yield', symbols: ['^TNX', 'TNX'], src: 'index', note: 'Yield index quote; units as reported by provider.' },
  { key: 'DXY', label: 'USD Index', symbols: ['DX-Y.NYB', 'DXY', '^DXY'], src: 'index' },
];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function normQuote(r) {
  if (!r || !r.symbol) return null;
  const price = num(r.price);
  if (price === null) return null;
  const prev = num(r.previousClose);
  let pct = num(r.changePercentage ?? r.changesPercentage);
  const chg = num(r.change);
  if (pct === null && prev) pct = ((price - prev) / prev) * 100;
  return {
    symbol: r.symbol, name: r.name || r.symbol, price, change: chg, pct,
    open: num(r.open), high: num(r.dayHigh), low: num(r.dayLow), prevClose: prev,
    volume: num(r.volume), avgVolume: num(r.avgVolume), marketCap: num(r.marketCap),
    yearHigh: num(r.yearHigh), yearLow: num(r.yearLow), ma50: num(r.priceAvg50), ma200: num(r.priceAvg200),
    exchange: r.exchange || null, ts: r.timestamp ? new Date(Number(r.timestamp) * 1000).toISOString() : null,
  };
}

export async function quotes(symbols) {
  const list = [...new Set(symbols)].filter(Boolean);
  if (!list.length) return { map: new Map(), meta: null };
  const res = await call('batch-quote', { symbols: list.join(',') });
  const map = new Map();
  (Array.isArray(res.data) ? res.data : []).forEach((r) => { const q = normQuote(r); if (q) map.set(q.symbol, q); });
  return { map, meta: res.meta };
}

export async function indexSnapshot() {
  const [idx, etf] = await Promise.allSettled([call('batch-index-quotes'), call('batch-quote', { symbols: 'QQQ' })]);
  const pool = new Map();
  const errors = [];
  let meta = null;
  if (idx.status === 'fulfilled') { meta = idx.value.meta; (idx.value.data || []).forEach((r) => { const q = normQuote(r); if (q) pool.set(q.symbol, q); }); } else errors.push(idx.reason);
  if (etf.status === 'fulfilled') { meta = meta || etf.value.meta; (etf.value.data || []).forEach((r) => { const q = normQuote(r); if (q) pool.set(q.symbol, q); }); } else errors.push(etf.reason);
  if (!pool.size && errors.length) throw errors[0];
  return {
    meta,
    items: INDEX_DEFS.map((d) => {
      const sym = d.symbols.find((s) => pool.has(s));
      return { def: d, quote: sym ? pool.get(sym) : null };
    }),
  };
}

let constituentCache = null;
export async function nasdaq100() {
  if (constituentCache) return constituentCache;
  const res = await call('nasdaq-constituent');
  const rows = (Array.isArray(res.data) ? res.data : []).filter((r) => r.symbol);
  if (!rows.length) throw Object.assign(new Error('empty'), { code: 'empty' });
  constituentCache = { rows: rows.map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector || null, subSector: r.subSector || null })), meta: res.meta };
  return constituentCache;
}

export async function universeQuotes() {
  const c = await nasdaq100();
  const { map, meta } = await quotes(c.rows.map((r) => r.symbol));
  const rows = c.rows.map((r) => ({ ...r, q: map.get(r.symbol) || null })).filter((r) => r.q);
  return { rows, meta, universeSize: c.rows.length };
}

// Breadth is computed from the NASDAQ-100 universe only (stated in the UI).
export function breadth(rows) {
  let adv = 0, dec = 0, unch = 0;
  rows.forEach((r) => { const p = r.q.pct; if (p === null) return; if (p > 0) adv++; else if (p < 0) dec++; else unch++; });
  return { adv, dec, unch, total: adv + dec + unch };
}

export async function sectorPerformance() {
  // Snapshot is per trading date: walk back up to 6 calendar days until data appears.
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    const iso = new Date(d.getTime() - i * 864e5).toISOString().slice(0, 10);
    const res = await call('sector-performance-snapshot', { date: iso, exchange: 'NASDAQ' });
    if (Array.isArray(res.data) && res.data.length) {
      return { date: iso, meta: res.meta, rows: res.data.map((r) => ({ sector: r.sector, pct: num(r.averageChange) })).filter((r) => r.pct !== null).sort((a, b) => b.pct - a.pct) };
    }
  }
  throw Object.assign(new Error('empty'), { code: 'empty' });
}

export async function searchSymbols(query) {
  const res = await call('search-symbol', { query, limit: 8 });
  return (Array.isArray(res.data) ? res.data : []).map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange || r.exchangeFullName || '' }));
}

export async function profile(symbol) {
  const res = await call('profile', { symbol });
  const r = Array.isArray(res.data) ? res.data[0] : res.data;
  return r ? { symbol, sector: r.sector || null, industry: r.industry || null, name: r.companyName || symbol } : null;
}
