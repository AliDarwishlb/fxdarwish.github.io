// User preferences, watchlists, alerts and portfolio — persisted in localStorage.
const KEY = 'nit.v1';
const DEFAULTS = {
  tz: 'Asia/Beirut',
  watchlists: [{ id: 'wl1', name: 'Main', symbols: ['NVDA', 'AAPL', 'MSFT'] }],
  activeWatchlist: 'wl1',
  alerts: [],       // { id, symbol, type:'price_above'|'price_below'|'pct_up'|'pct_down', value, active, firedAt }
  holdings: [],     // { symbol, shares, cost }
};
let state;
const subs = new Set();

function load() {
  try { state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { state = structuredClone(DEFAULTS); }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: session-only */ }
  subs.forEach((f) => f(state));
}
load();

export const get = () => state;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const set = (patch) => { state = { ...state, ...patch }; persist(); };
const uid = () => Math.random().toString(36).slice(2, 9);

export const watchlists = {
  active() { return state.watchlists.find((w) => w.id === state.activeWatchlist) || state.watchlists[0]; },
  create(name) { const w = { id: uid(), name: name.trim() || 'Watchlist', symbols: [] }; set({ watchlists: [...state.watchlists, w], activeWatchlist: w.id }); },
  remove(id) { if (state.watchlists.length < 2) return; const l = state.watchlists.filter((w) => w.id !== id); set({ watchlists: l, activeWatchlist: l[0].id }); },
  select(id) { set({ activeWatchlist: id }); },
  add(sym) { const s = sym.toUpperCase(); set({ watchlists: state.watchlists.map((w) => (w.id === state.activeWatchlist && !w.symbols.includes(s) ? { ...w, symbols: [...w.symbols, s] } : w)) }); },
  drop(sym) { set({ watchlists: state.watchlists.map((w) => (w.id === state.activeWatchlist ? { ...w, symbols: w.symbols.filter((x) => x !== sym) } : w)) }); },
  has(sym) { return watchlists.active().symbols.includes(sym); },
};

export const alerts = {
  add(a) { set({ alerts: [...state.alerts, { id: uid(), active: true, firedAt: null, ...a }] }); },
  remove(id) { set({ alerts: state.alerts.filter((a) => a.id !== id) }); },
  rearm(id) { set({ alerts: state.alerts.map((a) => (a.id === id ? { ...a, active: true, firedAt: null } : a)) }); },
  markFired(id) { set({ alerts: state.alerts.map((a) => (a.id === id ? { ...a, active: false, firedAt: new Date().toISOString() } : a)) }); },
};

export const holdings = {
  upsert(h) { const rest = state.holdings.filter((x) => x.symbol !== h.symbol); set({ holdings: [...rest, h] }); },
  remove(sym) { set({ holdings: state.holdings.filter((x) => x.symbol !== sym) }); },
};
