# Command Center — web app

Your personal command center with a real ElevenLabs voice (Clyde), live Todoist agenda,
live US markets, Riyadh prayer times, plus tasks/projects/prayer-tracker. Works on phone and desktop.

## What's inside
- `server.js` — Node/Express backend (serves the page + proxies ElevenLabs, Todoist, FMP, prayer times)
- `public/index.html` — the dashboard
- `package.json` — dependencies (Express only)

All secrets live in **environment variables** — never in the code or the page.

## Environment variables
| Variable | Required | What it does |
|---|---|---|
| `ELEVENLABS_API_KEY` | for voice | Your ElevenLabs API key (free account → Profile → API Keys) |
| `ELEVENLABS_VOICE_ID` | optional | Defaults to **Clyde** (`2EiwWnXFnvU5JabPnv8n`). Change to use another voice. |
| `TODOIST_TOKEN` | for live agenda | Todoist → Settings → Integrations → Developer → API token |
| `FMP_API_KEY` | for live markets | Your Financial Modeling Prep API key |
| `APP_PASSWORD` | recommended | A password to keep the page private. If unset, the page is public to anyone with the URL. |

The app runs fine with only some set — missing ones just show "connect" and the rest still works.

## Deploy to Render (free)
1. Put these files in a GitHub repo (keep the folder structure: `server.js`, `package.json`, `public/index.html`).
2. On https://render.com → **New → Web Service** → connect the repo.
3. Settings: **Runtime** Node; **Build command** `npm install`; **Start command** `npm start`.
4. Add the environment variables above under **Environment**.
5. Create the service. Render gives you a URL like `https://command-center-xxxx.onrender.com`.
6. Open it on your phone and desktop — set `APP_PASSWORD` first so it stays private.

## Run locally (optional)
```
npm install
ELEVENLABS_API_KEY=... TODOIST_TOKEN=... FMP_API_KEY=... APP_PASSWORD=... npm start
# open http://localhost:3000
```

## Notes
- The ElevenLabs free tier (~10k characters/month) is plenty for a daily greeting + briefing.
- Tasks, projects, and the prayer tracker are saved per-device in the browser.
- Prayer times are pulled live for Riyadh (Aladhan API, no key).
