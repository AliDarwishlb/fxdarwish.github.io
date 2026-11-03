// Base URL of the Cloudflare Worker that proxies the market-data provider.
// The API key lives only in the Worker's secrets - never in this repo or the browser.
// For local testing run the Worker with 'wrangler dev' and set this to its http://localhost:8787 URL.
export const API_BASE = 'https://fxd-fmp.ali-darwish-lb.workers.dev';
