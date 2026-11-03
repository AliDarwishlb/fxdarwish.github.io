// Base URL of the Cloudflare Worker that proxies the market-data provider.
// The API key lives only in the Worker's secrets - never in this repo or the browser.
export const API_BASE = 'https://fxd-fmp.ali-darwish-lb.workers.dev';

// 'free': provider plan only allows single-symbol quotes (250 calls/day) -> reduced overview, slower refresh.
// 'paid': bulk quotes, index quotes and the NASDAQ-100 list are available -> full overview.
export const PLAN = 'free';

// Free plan: fixed sample of large NASDAQ-100 names (a static list, NOT the live index membership).
// Only symbols the provider's free plan actually serves (verified against the live Worker).
export const FREE_UNIVERSE = [
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'],
  ['META', 'Meta Platforms'], ['GOOGL', 'Alphabet'], ['TSLA', 'Tesla'], ['COST', 'Costco'],
  ['AMD', 'AMD'], ['NFLX', 'Netflix'],
];
export const REFRESH_MS = PLAN === 'free' ? 15 * 60 * 1000 : 30 * 1000;

// Live News Worker (public RSS feeds, no key). Deploy from nasdaq-terminal/news-worker.
export const NEWS_BASE = 'https://fxd-news.ali-darwish-lb.workers.dev';
