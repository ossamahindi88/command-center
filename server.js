// Command Center — Node/Express backend
// Voice via Microsoft Edge neural TTS (free, no key, works from a server).
// Also proxies Todoist, FMP markets, and prayer times. Secrets live only in env vars.

const express = require('express');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TTS_VOICE = process.env.TTS_VOICE || 'en-GB-RyanNeural'; // British male neural
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

// Edge neural TTS -> mp3
function synth(text, voice) {
  return new Promise(async (resolve, reject) => {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks = [];
      const timer = setTimeout(() => reject(new Error('tts timeout')), 25000);
      audioStream.on('data', d => chunks.push(d));
      audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      audioStream.on('error', e => { clearTimeout(timer); reject(e); });
    } catch (e) { reject(e); }
  });
}

app.post('/api/tts', auth, async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '').slice(0, 2000);
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
