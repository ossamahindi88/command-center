// Command Center — Node/Express backend
// Serves the dashboard and proxies: ElevenLabs (Clyde) TTS, Todoist, FMP markets, prayer times.
// Secrets live ONLY in environment variables (never in the frontend).

const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const EL_KEY = process.env.ELEVENLABS_API_KEY || '';
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || '2EiwWnXFnvU5JabPnv8n'; // Clyde
const TODOIST = process.env.TODOIST_TOKEN || '';
const FMP = process.env.FMP_API_KEY || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

// Lightweight gate: if APP_PASSWORD is set, API calls must send it (header or query).
function auth(req, res, next) {
  if (!APP_PASSWORD) return next();
  const t = req.headers['x-cc-pass'] || req.query.pass;
  if (t === APP_PASSWORD) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Tell the frontend what's configured (no secrets revealed).
app.get('/api/config', (req, res) => {
  res.json({
    needsPassword: !!APP_PASSWORD,
    tts: !!EL_KEY,
    todoist: !!TODOIST,
    markets: !!FMP
  });
});

// Verify password (used by the login gate).
app.get('/api/check', auth, (req, res) => res.json({ ok: true }));

// ElevenLabs TTS -> mp3 audio (Clyde by default)
app.post('/api/tts', auth, async (req, res) => {
  try {
    if (!EL_KEY) return res.status(400).json({ error: 'ELEVENLABS_API_KEY not set' });
    const text = String((req.body && req.body.text) || '').slice(0, 2500);
    if (!text) return res.status(400).json({ error: 'no text' });
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (!r.ok) { const e = await r.text(); return res.status(502).json({ error: 'tts failed', detail: e.slice(0, 300) }); }
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Today's agenda from Todoist (prayer tasks excluded)
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

// US index quotes + market status from FMP
app.get('/api/markets', auth, async (req, res) => {
  try {
    if (!FMP) return res.json({ connected: false });
    const q = await (await fetch(`https://financialmodelingprep.com/api/v3/quote/%5EGSPC,%5EIXIC,%5EDJI?apikey=${FMP}`)).json();
    res.json({ connected: true, indices: Array.isArray(q) ? q : [] });
  } catch (e) { res.json({ connected: false, error: String(e) }); }
});

// Riyadh prayer times (free, no key)
app.get('/api/prayer', async (req, res) => {
  try {
    const r = await fetch('https://api.aladhan.com/v1/timingsByCity?city=Riyadh&country=Saudi%20Arabia&method=4');
    const j = await r.json();
    res.json({ timings: (j.data && j.data.timings) || null });
  } catch (e) { res.json({ error: String(e) }); }
});

app.use(express.static(__dirname));
app.listen(PORT, () => console.log('Command Center running on port ' + PORT));
