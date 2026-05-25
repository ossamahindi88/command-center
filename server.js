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
    const r = await fetch('https://api.todoist.com/rest/v2/tasks?filter=' + encodeURIComponent('today | overdue'),
      { headers: { Authorization: 'Bearer ' + TODOIST } });
    const arr = await r.json();
    const tasks = (Array.isArray(arr) ? arr : [])
      .filter(t => !/prayer|fajr|dhuhr|asr|maghrib|isha/i.test(t.content || ''))
      .map(t => ({ content: t.content, time: (t.due && (t.due.datetime || t.due.date)) || '' }));
    res.json({ connected: true, tasks });
  } catch (e) { res.json({ connected: false, tasks: [], error: String(e) }); }
});

app.get('/api/markets', auth, async (req, res) => {
  try {
    if (!FMP) return res.json({ connected: false });
    const q = await (await fetch(`https://financialmodelingprep.com/api/v3/quote/%5EGSPC,%5EIXIC,%5EDJI?apikey=${FMP}`)).json();
    res.json({ connected: true, indices: Array.isArray(q) ? q : [] });
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
