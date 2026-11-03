// Live news service + rule-based tagging. Tags are keyword rules, NOT AI, and the page says so.
import { NEWS_BASE } from '../config.js';
import { ApiError } from './api.js';

export async function loadNews() {
  let r;
  try { r = await fetch(`${NEWS_BASE}/`); }
  catch { throw new ApiError('news_unavailable', 'The news service is not reachable. Deploy the news Worker (nasdaq-terminal/news-worker/README.md).'); }
  let b = null;
  try { b = await r.json(); } catch {}
  if (!b || b.ok !== true) throw new ApiError('news_unavailable', 'The news service returned an error.');
  return b; // { data:{items,sources}, meta }
}

// High-impact words (central banks, inflation, jobs, trade shocks, big-bank/market events).
const HIGH = /\b(fomc|fed(eral reserve)?|powell|rate (cut|hike|decision)|interest rates?|cpi|pce|ppi|inflation|nonfarm|nfp|payrolls?|jobless|unemployment|gdp|recession|tariffs?|sanctions?|ecb|boe|boj|snb|rba|lagarde|bailey|ueda|opec|default|downgrade|emergency|flash crash|circuit breaker)\b/i;

export const CATEGORIES = [
  ['Fed & rates', /\b(fomc|fed(eral reserve)?|powell|rate (cut|hike|decision)|interest rates?|ecb|boe|boj|snb|rba|lagarde|bailey|ueda|central bank|treasury yields?)\b/i],
  ['Inflation', /\b(cpi|pce|ppi|inflation|prices?)\b/i],
  ['Jobs & growth', /\b(nonfarm|nfp|payrolls?|jobless|unemployment|jobs|gdp|retail sales|pmi|ism|recession)\b/i],
  ['Trade & geopolitics', /\b(tariffs?|trade war|sanctions?|opec|war|election|shutdown)\b/i],
  ['Earnings', /\b(earnings|eps|revenue|guidance|quarterly results)\b/i],
  ['Tech & AI', /\b(ai|artificial intelligence|chips?|semiconductors?|nvidia|apple|microsoft|alphabet|google|meta|amazon|tesla|nasdaq)\b/i],
  ['Forex & commodities', /\b(forex|fx|dollar|usd|eur|gbp|jpy|chf|aud|cad|nzd|gold|oil|crude|bitcoin)\b/i],
];

export function classify(item, now = Date.now()) {
  const ageMin = (now - new Date(item.ts).getTime()) / 60000;
  const high = HIGH.test(item.title);
  const cat = (CATEGORIES.find(([, re]) => re.test(item.title)) || ['Other'])[0];
  return { ...item, ageMin, high, cat, fresh: ageMin <= 30, breaking: high && ageMin <= 30 };
}
