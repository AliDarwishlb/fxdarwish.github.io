// Reusable UI pieces: states, provenance tags, sortable tables, toasts.
import { esc, fmtTime, timeAgo } from '../core/format.js';
import { explain } from '../services/api.js';

export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export const skeleton = (rows = 4) => `<div class="body" style="display:grid;gap:8px">${Array.from({ length: rows }, (_, i) => `<div class="skel" style="width:${90 - i * 12}%"></div>`).join('')}</div>`;

export function errorState(err, { retry = true } = {}) {
  const code = err && err.code;
  const setup = code === 'not_configured' ? '<code>wrangler secret put FMP_API_KEY</code>' : '';
  return `<div class="state err"><b>Data unavailable</b><span>${esc(explain(err))}</span>${setup}${retry ? '<button class="btn ghost sm" data-retry>Retry</button>' : ''}</div>`;
}

export const emptyState = (title, hint = '') => `<div class="state"><b>${esc(title)}</b><span>${esc(hint)}</span></div>`;

// Provenance label. We can only claim what the provider/proxy told us: fetch time and cache status.
export function sourceTag(meta, tz) {
  if (!meta) return '<span class="mut">no data</span>';
  const when = fmtTime(meta.fetchedAt, tz);
  const flags = `${meta.cached ? ' · cached' : ''}${meta.stale ? ' · stale' : ''}`;
  return `<span class="mut" title="${esc(when)}">${esc(meta.provider)} · ${timeAgo(meta.fetchedAt)}${flags}</span>`;
}

export function wireRetry(root, fn) { root.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', fn)); }

// Sortable table. cols: [{key,label,html(row),val(row)}]
export function sortableTable(cols, rows, { sortKey = cols[1]?.key, desc = true, onRow, empty = 'No rows' } = {}) {
  const wrap = h('<div class="tbl-wrap"></div>');
  let key = sortKey, dir = desc;
  const draw = () => {
    const col = cols.find((c) => c.key === key) || cols[0];
    const data = [...rows].sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      const r = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return dir ? -r : r;
    });
    wrap.innerHTML = rows.length
      ? `<table><thead><tr>${cols.map((c) => `<th data-k="${c.key}" class="${c.key === key ? `sorted${dir ? '' : ' asc'}` : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${data.map((r, i) => `<tr data-i="${i}">${cols.map((c) => `<td>${c.html(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : emptyState(empty);
    wrap.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; if (k === key) dir = !dir; else { key = k; dir = true; } draw(); }));
    if (onRow) wrap.querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', (e) => onRow(data[Number(tr.dataset.i)], e)));
  };
  draw();
  return wrap;
}

export function toast(html, { ms = 5000, action } = {}) {
  const host = document.getElementById('toasts');
  const t = h(`<div class="toast">${html}${action ? `<div style="margin-top:8px"><button class="btn sm" data-act>${esc(action.label)}</button></div>` : ''}</div>`);
  if (action) t.querySelector('[data-act]').addEventListener('click', () => { action.run(); t.remove(); });
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
