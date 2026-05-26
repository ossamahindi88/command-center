// Command Center — Node/Express backend
// Voice via ttsMP3 (Amazon Polly) — reliable from a server, no key.
// Also proxies Todoist, FMP markets, and prayer times. Secrets live only in env vars.

const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TTS_VOICE = process.env.TTS_VOICE || 'Matthew'; // Polly voice (Matthew, Brian, Joey, Russell, Amy, Emma, Joanna, ...)
const TODOIST = process.env.TODOIST_TOKEN || '';
const FMP = process.env.FMP_API_KEY || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function auth(req, res, next) {
  if (!APP_PASSWORD) return next();
  const t = req.headers['x-cc-pass'] || req.query.pass;
  if (t === APP_PASSWORD) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/config', (req, res) => {
  res.json({ needsPassword: !!APP_PASSWORD, tts: true, todoist: !!TODOIST, markets: !!FMP, voice: TTS_VOICE });
});

app.get('/api/check', auth, (req, res) => res.json({ ok: true }));

// ttsMP3 (Amazon Polly) -> mp3
async function synth(text, voice) {
  const body = new URLSearchParams();
  body.set('msg', text);
  body.set('lang', voice);
  body.set('source', 'ttsmp3');
  const m = await fetch('https://ttsmp3.com/makemp3_new.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });
  const j = await m.json();
  if (!j || !j.URL) throw new Error('ttsmp3 failed: ' + JSON.stringify(j).slice(0, 120));
  const a = await fetch(j.URL);
  if (!a.ok) throw new Error('mp3 fetch failed: ' + a.status);
  return Buffer.from(await a.arrayBuffer());
}

app.post('/api/tts', auth, async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '').slice(0, 2500);
    if (!text) return res.status(400).json({ error: 'no text' });
    const voice = (req.body && req.body.voice) || TTS_VOICE;
    const buf = await synth(text, voice);
    if (!buf || !buf.length) return res.status(502).json({ error: 'empty audio' });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) { res.status(502).json({ error: 'tts failed', detail: String(e).slice(0, 200) }); }
});

app.get('/api/agenda', auth, async (req, res) => {
  try {
    if (!TODOIST) return res.json({ connected: false, tasks: [] });
    // Todoist unified API (v1). Fetch tasks then filter for today/overdue server-side.
    const r = await fetch('https://api.todoist.com/api/v1/tasks?limit=200',
      { headers: { Authorization: 'Bearer ' + TODOIST.trim() } });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { return res.json({ connected: false, tasks: [], error: 'todoist non-json: ' + txt.slice(0, 120) }); }
    const list = Array.isArray(data) ? data : (data.results || data.items || data.tasks || []);
    const todayISO = new Date().toISOString().slice(0, 10);
    const tasks = list
      .filter(t => {
        const d = (t.due && (t.due.date || t.due.datetime)) || '';
        return d && d.slice(0, 10) <= todayISO;
      })
      .filter(t => !/prayer|fajr|dhuhr|asr|maghrib|isha/i.test(t.content || ''))
      .map(t => ({ content: t.content, time: (t.due && (t.due.datetime || t.due.date)) || '' }));
    res.json({ connected: true, tasks });
  } catch (e) { res.json({ connected: false, tasks: [], error: String(e) }); }
});

async function yahooQuote(sym) {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?interval=1d&range=2d',
      { headers: { 'User-Agent': 'Mozilla/5.0 (CommandCenter)' } });
    const j = await r.json();
    const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
    const pct = (price != null && prev) ? ((price - prev) / prev) * 100 : 0;
    return { symbol: sym, price: price, changesPercentage: pct };
  } catch (e) { return null; }
}

app.get('/api/markets', auth, async (req, res) => {
  try {
    // ETFs as proxies — Yahoo Finance, free, no key required.
    const syms = ['SPY', 'QQQ', 'DIA'];
    const arr = await Promise.all(syms.map(yahooQuote));
    const map = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', DIA: 'Dow Jones' };
    const indices = arr.filter(Boolean).map(q => Object.assign(q, { name: map[q.symbol] || q.symbol }));
    res.json({ connected: indices.length > 0, indices });
  } catch (e) { res.json({ connected: false, error: String(e) }); }
});

app.get('/api/prayer', async (req, res) => {
  try {
    const r = await fetch('https://api.aladhan.com/v1/timingsByCity?city=Riyadh&country=Saudi%20Arabia&method=4');
    const j = await r.json();
    res.json({ timings: (j.data && j.data.timings) || null });
  } catch (e) { res.json({ error: String(e) }); }
});

app.use(express.static(__dirname));
app.listen(PORT, () => console.log('Command Center running on port ' + PORT));
