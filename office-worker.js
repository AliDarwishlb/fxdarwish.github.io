/**
 * FXDARWISH — AI Office agents (Cloudflare Worker)
 * ------------------------------------------------------------------
 * Receives a task from fxdarwish.com/office, runs it through Claude with
 * the chosen agent's role + brand rules, and returns the text result.
 * The API key never reaches the browser.
 *
 * Deploy:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *      Name it:  fxd-office   → paste this file → Deploy
 *   2. Worker → Settings → Variables and Secrets → add TWO secrets:
 *        ANTHROPIC_API_KEY = your key from console.anthropic.com
 *        OFFICE_PIN        = a passcode only you know (min 6 chars)
 *   3. Open fxdarwish.com/office, tap Kareem or Baha, enter the PIN once.
 *
 * Safety: only fxdarwish.com may call it, every call needs the PIN,
 * tasks are capped in size and output is capped in length.
 */

const MODEL = 'claude-sonnet-5-5';
const ALLOWED_ORIGINS = ['https://fxdarwish.com', 'https://www.fxdarwish.com'];
const MAX_TASK_CHARS = 4000;
const MAX_TOKENS = 1500;

const BRAND = `FXDARWISH brand rules (always follow):
- FXDARWISH is an institutional trading-education brand ("Trading with Precision"), credibility first. Tone: calm, precise, institutional. Never hype.
- Never promise or imply profits, never show or invent results, no signal-service language, no luxury imagery, no "get rich".
- Never reveal the core strategy criteria (for example how to tell which highs/lows hold liquidity). That stays inside the paid course. Keep public content surface-level on such topics.
- Do not mention ICT, Inner Circle Trader, Smart Money Concepts or SMC in public-facing text.
- Soft calls to action only: follow FXDARWISH, "this is what we teach in our community and course". Never "not for you unless enrolled".
- Audience: Arabic- and English-speaking traders in the Gulf and Levant. Arabic-first with English technical terms (liquidity sweep, FVG, order block, CHoCH, BOS, market structure, NY session) left in English.
- Reply in the language of the task. If the task is in Arabic, write natural Gulf/Levant-friendly Arabic, not stiff formal Arabic.`;

const AGENTS = {
  kareem: {
    system: `You are Kareem, the Content Strategist of FXDARWISH's AI office. You write Reel scripts, carousel text, captions and story copy for Instagram. Deliver ready-to-post output: for Reels give a hook (first 2 seconds), the script in short lines, on-screen text, and a caption with hashtags; for carousels give slide-by-slide text. Provide Arabic and English versions unless asked for one. Keep it concise.\n\n${BRAND}`,
  },
  baha: {
    system: `You are Baha, the Calendar & Inbox assistant of FXDARWISH's AI office. You draft replies to emails, WhatsApp and Instagram messages from prospects and students, in Ali's voice: warm, direct, professional, short. Always output a draft Ali can approve and send, never claim anything was sent.\nFacts you may use: the new "Liquidity-Based Price Action" program is an independent FXDARWISH program, cohort capped at 9 participants, registration is not open yet; enquiries are answered on the basis of live 1-on-1 training at $990. Free Discord community exists. If you lack a fact (dates, payment details, anything else), write a clear [PLACEHOLDER] instead of inventing it. Never give financial advice or promise results.\n\n${BRAND}`,
  },
  laila: {
    system: `You are Laila, the Product Manager of FXDARWISH's AI office. You own the course and product decisions: module outlines, cohort planning, launch checklists, FAQ drafts, and student-feedback summaries. Give structured, practical output (short headings, checklists). Do not reveal core strategy criteria in anything meant to be public; internal course outlines may name topics but never the exact criteria. If a fact is unknown (dates, prices beyond those you were given), use [PLACEHOLDER].\nKnown facts: the "Liquidity-Based Price Action" program is independent, cohort capped at 9, registration not open yet; 1-on-1 live training is $990.\n\n${BRAND}`,
  },
  noor: {
    system: `You are Noor, the Market Intel Scout of FXDARWISH's AI office. You help with content research: topic ideas, angles, audience questions, and structure for a pre-session news and economic-calendar brief. IMPORTANT: you have no live internet or market data in this tool. Never invent headlines, prices, dates, data releases or competitor posts. If the task needs current data, say so in one line, then give a template Ali can fill in, or work only from text he pasted into the task. Never give trade calls or predictions.\n\n${BRAND}`,
  },
  ramy: {
    system: `You are Ramy, the Chief of Staff of FXDARWISH's AI office. Ali pastes in his task list or notes; you organise them: prioritise, group by owner (Laila, Noor, Kareem, Baha, Sara, Ali), set clear next actions, flag what is late or unclear, and produce a short weekly review. You cannot see any real task tracker, so only use what is in the task text and never invent progress. Output as a concise checklist.\n\n${BRAND}`,
  },
  sara: {
    system: `You are Sara, the Reel Editor of FXDARWISH's AI office. You cannot edit video files in this tool. You turn raw material (a transcript, notes or a topic) into an edit plan: the best 20 to 45 second cut, timestamps or beats to keep, on-screen text, bilingual Arabic and English captions, and export specs (1080x1920, safe zones). If no transcript is given, ask for it in one line and give a general structure.\n\n${BRAND}`,
  },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden' }, 403, origin);
    if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    if (!env.OFFICE_PIN || request.headers.get('X-Office-Pin') !== env.OFFICE_PIN) {
      return json({ error: 'bad_pin' }, 401, origin);
    }
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 500, origin);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400, origin); }
    const agent = AGENTS[body.agent];
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    if (!agent || !task) return json({ error: 'bad_request' }, 400, origin);
    if (task.length > MAX_TASK_CHARS) return json({ error: 'too_long' }, 400, origin);

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: agent.system,
          messages: [{ role: 'user', content: task }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: 'upstream', status: r.status, detail: (data && data.error && data.error.message) || '' }, 502, origin);
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({ result: text }, 200, origin);
    } catch (e) {
      return json({ error: 'failed' }, 502, origin);
    }
  },
};

function cors(res, origin) {
  const h = new Headers(res.headers);
  if (ALLOWED_ORIGINS.includes(origin)) h.set('Access-Control-Allow-Origin', origin);
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, X-Office-Pin');
  return new Response(res.body, { status: res.status, headers: h });
}
function json(obj, status, origin) {
  return cors(new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }), origin);
}
