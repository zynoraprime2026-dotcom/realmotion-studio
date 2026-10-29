# Tasveer Studio — AI Film Studio

A cinematic, responsive web app for developing story ideas into editable, shot-by-shot film treatments.

## What works

- Full-screen motion-study hero with playback, scrubbing, and fullscreen controls
- Story prompt, visual-language, aspect-ratio, and duration controls
- Editable three-scene storyboard planner with timed storyboard playback
- Original concept collection with genre filters and detailed treatment previews
- Creative-seed handoff from any sample treatment into the studio
- Text treatment downloads
- Browser-local My films library with reopen, export, and confirmed deletion
- Keyboard-accessible dialogs and mobile navigation, reduced-motion support, and responsive layouts

## Scope and storage

This version is frontend-only. It creates storyboard briefs, not rendered AI video, and does not claim to call a video model. Projects are stored in this browser's localStorage; they do not sync across devices and are removed if site data is cleared.

## AI key art (optional)

With `STUDIO_API_KEY` set, the studio can paint concept art for the active scene.
The browser never sees that key: it posts to `/api/studio`, a serverless function
that attaches the key and forwards only two endpoints, `/v1/image/generate` and
`/v1/content/generate`. Video rendering is deliberately not wired.

Set it in the hosting project, never in a `VITE_` variable:

| Variable | Purpose |
|---|---|
| `STUDIO_API_URL` | defaults to the Render deployment of studio-api |
| `STUDIO_API_KEY` | required to enable key art; the function returns 503 without it |
| `STUDIO_PROXY_LIMIT` | AI requests allowed per IP per hour, default 10 |

Without the key the app behaves exactly as before, as a local storyboard planner.

## AI key art (optional)

The studio can paint a scene with the companion [studio-api](https://studio-api-nqpm.onrender.com) service. The key never reaches the browser: `api/studio.ts` is a Vercel function that holds `STUDIO_API_KEY` server-side and forwards only two actions.

| Variable | Required | Effect when missing |
|---|---|---|
| `STUDIO_API_KEY` | for AI artwork | `/api/studio` answers 503 and the app stays a local storyboard planner |
| `STUDIO_API_URL` | no | defaults to `https://studio-api-nqpm.onrender.com` |
| `STUDIO_PROXY_LIMIT` | no | 10 AI requests per IP per hour |

Allowed actions are `image` (prompt, clamped width and height) and `content` (topic, type). Video rendering is deliberately not wired: a movie render costs 20 credits and minutes of Replicate time, so it needs a gate before it can face the public.

Set these in the Vercel project (never with a `VITE_` prefix, which would inline them into the public bundle), then redeploy.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Visual system

React, TypeScript, Vite, Manrope, Instrument Serif, Lucide icons, custom CSS, and locally bundled cinematic artwork. The hero MP4 is a locally produced motion study from the hero artwork, so playback has no external runtime dependency.

## Run it on your laptop

Needs Node 20 or newer and Git.

```bash
git clone https://github.com/zynoraprime2026-dotcom/tasveer-studio.git
cd tasveer-studio
npm install
cp .env.example .env.local     # then paste your STUDIO_API_KEY into it
npm run dev                    # http://localhost:5173
```

`npm run dev` gives you the app, but key art needs the proxy, which only runs on
Vercel or another Node host. Two options:

- `npx vercel dev` instead of `npm run dev` runs the app *and* `api/studio.ts`
  locally, which is the closest match to production.
- Point `STUDIO_API_URL` at a studio-api you run yourself
  (`git clone https://github.com/zynoraprime2026-dotcom/studio-api`, `npm install`,
  `node server.js`, port 3000) and keep using `npm run dev`.

The key must never carry a `VITE_` prefix. Anything starting with `VITE_` is
compiled into the public bundle, which would hand your studio-api credits to
anyone who views the page.

Other scripts: `npm run build`, `npm run lint`, `npm test`.
