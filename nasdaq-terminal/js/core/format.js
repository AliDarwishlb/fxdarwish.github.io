// Formatting + financial calculation helpers (pure functions).
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const fmt = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const fmtPct = (v, d = 2) => (isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}%` : '—');
export const fmtSigned = (v, d = 2) => (isNum(v) ? `${v > 0 ? '+' : ''}${fmt(v, d)}` : '—');
export const fmtCompact = (v) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
};
export const cls = (v) => (isNum(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : 'mut');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const logoUrl = (sym) => `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(sym)}.png`;

// Heat colour: continuous scale clamped at ±3 %.
export function heatColor(pct) {
  if (!isNum(pct)) return '#2a3547';
  const t = Math.min(Math.abs(pct) / 3, 1);
  const a = 0.28 + t * 0.62;
  return pct >= 0 ? `rgba(0,192,135,${a.toFixed(2)})` : `rgba(255,83,100,${a.toFixed(2)})`;
}

// Portfolio math
export function positionStats(shares, cost, q) {
  const value = isNum(q?.price) ? shares * q.price : null;
  const basis = shares * cost;
  return {
    value, basis,
    unrealized: value === null ? null : value - basis,
    unrealizedPct: value === null || basis === 0 ? null : ((value - basis) / basis) * 100,
    dayPnl: isNum(q?.change) ? shares * q.change : null,
  };
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(iso, tz) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso)); }
  catch { return iso; }
}
