// Serverless proxy in front of studio-api. Self-contained on purpose: the Vercel
// Node runtime is happiest with a single file per function, and every cross-file
// import here previously failed at load time with FUNCTION_INVOCATION_FAILED.

import { Readable } from 'node:stream'

type MinimalRequest = {
  method?: string
  body?: unknown
  query?: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

type MinimalResponse = {
  status: (code: number) => MinimalResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  end?: (body?: unknown) => void
}

const ALLOWED_ACTIONS = [
  'image',
  'content',
  'animate',
  'animate-status',
  'draft',
  'movie-create',
  'movie-status',
  'movie-suggestions',
  'movie-reshoot',
  'movie-assemble',
  'movie-list',
  'movie-cast',
  'movie-package',
  'movie-poster',
  'movie-vertical',
  'movie-trailer',
  'usage',
  'series-list',
  'series-create',
] as const
type StudioAction = (typeof ALLOWED_ACTIONS)[number]

// Polling and reading a job must not eat the caller's hourly allowance.
const METERED_ACTIONS: StudioAction[] = [
  'image',
  'content',
  'animate',
  'draft',
  'movie-create',
  'movie-reshoot',
  'movie-assemble',
  'movie-poster',
  'movie-vertical',
  'movie-trailer',
]

const MIN_DIMENSION = 256
const MAX_DIMENSION = 1536
const MAX_PROMPT = 1200
const MAX_TOPIC = 300

const PATHS: Record<'image' | 'content' | 'animate' | 'draft' | 'movie-create', string> = {
  image: '/v1/image/generate',
  content: '/v1/content/generate',
  animate: '/v1/video/image-to-video',
  draft: '/v1/movie/draft',
  'movie-create': '/v1/movie/create',
}

const MOVIE_ID = /^mov_[A-Za-z0-9-]{8,}$/
const DRAFT_ID = /^drf_[A-Za-z0-9-]{8,}$/
const SERIES_ID = /^ser_[A-Za-z0-9-]{8,}$/
const MAX_PROMPT_LONG = 2000
const MAX_SCENES = 12
const MIN_SCENES = 4
const MAX_STYLE = 300

const MAX_IMAGE_URL = 600
const JOB_ID = /^[A-Za-z0-9-]{8,64}$/

type Validated =
  | { action: StudioAction; payload: Record<string, string | number> }
  | { error: string }

/** Where an action lives upstream: fixed paths, plus the movie-id routes. */
export function upstreamPath(action: StudioAction, payload: Record<string, string | number>): string {
  const movieId = String(payload.movie_id ?? '')
  switch (action) {
    case 'movie-status':
    case 'movie-suggestions':
    case 'movie-reshoot':
    case 'movie-assemble':
    case 'movie-cast':
    case 'movie-package':
    case 'movie-poster':
    case 'movie-trailer':
      return `/v1/movie/${movieId}/${action.replace(/^movie-/g, '').replace('status', '')}`.replace(/\/$/, '')
    case 'movie-vertical':
      return `/v1/movie/${movieId}/re-cut`
    case 'movie-list':
      return '/v1/movie/list'
    case 'usage':
      return '/v1/usage'
    case 'series-list':
    case 'series-create':
      return '/v1/series'
    case 'image':
    case 'content':
    case 'animate':
    case 'draft':
    case 'movie-create':
      return PATHS[action]
    default:
      return ''
  }
}

/** GET actions are reads: status polls and the finished film itself. */
function isReadAction(action: StudioAction): boolean {
  return action === 'movie-status' || action === 'movie-suggestions' || action === 'movie-list' ||
    action === 'movie-cast' || action === 'movie-package' ||
    action === 'usage' || action === 'series-list'
}

/** The POST body for an id-carrying action must not re-send the id upstream. */
function upstreamBody(payload: Record<string, string | number>): Record<string, string | number> {
  const body = { ...payload }
  delete body.movie_id
  return body
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampDimension(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(parsed)))
}

export function validateProxyBody(body: unknown): Validated {
  if (!body || typeof body !== 'object') return { error: 'Send a JSON body with an action.' }
  const raw = body as Record<string, unknown>
  const action = readString(raw.action)

  if (!ALLOWED_ACTIONS.includes(action as StudioAction)) {
    return { error: `Unsupported action "${action || 'missing'}". Use one of: ${ALLOWED_ACTIONS.join(', ')}.` }
  }

  if (action === 'image') {
    const prompt = readString(raw.prompt)
    if (prompt.length < 3) return { error: 'Describe the image in at least 3 characters.' }
    if (prompt.length > MAX_PROMPT) return { error: `Keep the prompt under ${MAX_PROMPT} characters.` }
    return {
      action: 'image',
      payload: { prompt, width: clampDimension(raw.width, 1024), height: clampDimension(raw.height, 1536) },
    }
  }

  if (action === 'animate') {
    const imageUrl = readString(raw.image_url)
    if (!/^https:\/\//.test(imageUrl)) return { error: 'A https image_url is required to animate a still.' }
    if (imageUrl.length > MAX_IMAGE_URL) return { error: 'That image URL is too long.' }
    const prompt = readString(raw.prompt)
    if (prompt.length > MAX_PROMPT) return { error: `Keep the prompt under ${MAX_PROMPT} characters.` }
    const duration = Math.min(10, Math.max(2, Math.round(Number(raw.duration) || 5)))
    return { action: 'animate', payload: { image_url: imageUrl, prompt, duration } }
  }

  // --- director mode -------------------------------------------------------
  if (action === 'draft') {
    const prompt = readString(raw.prompt)
    if (prompt.length < 8) return { error: 'Describe the film in at least 8 characters.' }
    if (prompt.length > MAX_PROMPT_LONG) return { error: `Keep the prompt under ${MAX_PROMPT_LONG} characters.` }
    const payload: Record<string, string | number> = { prompt }
    const style = readString(raw.style)
    if (style) payload.style = style.slice(0, MAX_STYLE)
    const language = readString(raw.language)
    if (language) payload.language = language.slice(0, 40)
    if (raw.aspectRatio === '16:9' || raw.aspectRatio === '9:16') payload.aspectRatio = raw.aspectRatio
    const scenes = Number(raw.scenes)
    if (Number.isFinite(scenes)) payload.scenes = Math.min(MAX_SCENES, Math.max(MIN_SCENES, Math.round(scenes)))
    const duration = Number(raw.duration)
    if (Number.isFinite(duration)) payload.duration = Math.min(10, Math.max(3, Math.round(duration)))
    const seriesId = readString(raw.seriesId)
    if (seriesId) {
      if (!SERIES_ID.test(seriesId)) return { error: 'That series id does not look right.' }
      payload.seriesId = seriesId
    }
    return { action: 'draft', payload }
  }

  if (action === 'movie-create') {
    const draftId = readString(raw.draft_id)
    if (!DRAFT_ID.test(draftId)) return { error: 'Render from an approved shot list: send the draft_id.' }
    const payload: Record<string, unknown> = { draft_id: draftId }
    const title = readString(raw.title)
    if (title) payload.title = title.slice(0, 160)
    // the edited shot list, already reviewed by a person before it is paid for
    const scenes = Array.isArray(raw.scenes) ? raw.scenes : []
    if (!scenes.length) return { error: 'Send the shot list you approved.' }
    if (scenes.length > MAX_SCENES) return { error: `A film holds at most ${MAX_SCENES} scenes.` }
    payload.scenes = scenes.map((scene) => {
      const one = (scene ?? {}) as Record<string, unknown>
      return {
        visualPrompt: readString(one.visualPrompt).slice(0, 700),
        narrationText: readString(one.narrationText).slice(0, 700),
        duration: Math.min(10, Math.max(3, Math.round(Number(one.duration) || 5))),
      }
    })
    const QUALITIES = ['storyboard', 'standard', 'high']
    const quality = readString(raw.quality)
    if (quality) {
      if (!QUALITIES.includes(quality)) return { error: `Unsupported quality "${quality}". Use one of: ${QUALITIES.join(', ')}.` }
      payload.quality = quality
    }
    return { action: 'movie-create', payload: payload as Record<string, string | number> }
  }

  if (action === 'movie-list' || action === 'usage' || action === 'series-list') return { action, payload: {} }

  if (action === 'series-create') {
    const name = readString(raw.name)
    const bible = readString(raw.bible)
    if (name.length < 2) return { error: 'Give the series a name.' }
    if (name.length > 80) return { error: 'Keep the series name under 80 characters.' }
    if (bible.length > 2000) return { error: 'Keep the series bible under 2000 characters.' }
    return { action, payload: { name, bible } }
  }

  if (action === 'movie-cast' || action === 'movie-package') {
    const movieId = readString(raw.movie_id)
    if (!MOVIE_ID.test(movieId)) return { error: 'Send the movie_id returned when the film started.' }
    return { action, payload: { movie_id: movieId } }
  }

  if (action === 'movie-vertical' || action === 'movie-trailer' || action === 'movie-poster') {
    const movieId = readString(raw.movie_id)
    if (!MOVIE_ID.test(movieId)) return { error: 'Send the movie_id returned when the film started.' }
    return { action, payload: { movie_id: movieId } }
  }

  if (action === 'movie-status' || action === 'movie-suggestions' || action === 'movie-reshoot' || action === 'movie-assemble') {
    const movieId = readString(raw.movie_id)
    if (!MOVIE_ID.test(movieId)) return { error: 'Send the movie_id returned when the film started.' }
    if (action === 'movie-reshoot') {
      const scene = Math.round(Number(raw.scene))
      if (!Number.isFinite(scene) || scene < 1 || scene > MAX_SCENES) return { error: 'Choose which scene to re-shoot.' }
      return { action, payload: { movie_id: movieId, scene } }
    }
    return { action, payload: { movie_id: movieId } }
  }

  if (action === 'animate-status') {
    const jobId = readString(raw.job_id)
    if (!JOB_ID.test(jobId)) return { error: 'Send the job_id returned by the animate action.' }
    return { action: 'animate-status', payload: { job_id: jobId } }
  }

  const topic = readString(raw.topic)
  if (topic.length < 3) return { error: 'Describe the topic in at least 3 characters.' }
  if (topic.length > MAX_TOPIC) return { error: `Keep the topic under ${MAX_TOPIC} characters.` }
  const CONTENT_TYPES = ['shorts_script', 'lesson', 'social_post']
  const type = readString(raw.type) || 'shorts_script'
  if (!CONTENT_TYPES.includes(type)) {
    return { error: `Unsupported type "${type}". Use one of: ${CONTENT_TYPES.join(', ')}.` }
  }
  return { action: 'content', payload: { type, topic } }
}

export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>()
  return {
    isLimited(key: string) {
      const stamp = now()
      const recent = (hits.get(key) ?? []).filter((at) => stamp - at < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return true
      }
      recent.push(stamp)
      hits.set(key, recent)
      return false
    },
  }
}

export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (raw) {
    const first = raw.split(',')[0]?.trim()
    if (first) return first
  }
  const real = headers['x-real-ip']
  return (Array.isArray(real) ? real[0] : real) || 'unknown'
}

const PER_HOUR = Number(process.env.STUDIO_PROXY_LIMIT) || 10
// Render's free tier can take ~40s to wake, so give the studio real room.
const TIMEOUT_MS = 55_000
const limiter = createLimiter(PER_HOUR, 60 * 60 * 1000)

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  try {
    const query = req.query ?? {}
    const queryAction = readString(Array.isArray(query.action) ? query.action[0] : query.action)

    // A browser <video> can only issue GET, so a finished film is streamed here.
    if (req.method === 'GET' && queryAction === 'movie') {
      const key = process.env.STUDIO_API_KEY
      if (!key) return res.status(503).json({ error: 'AI artwork is not switched on for this deployment yet.' })
      const movieId = readString(Array.isArray(query.movie_id) ? query.movie_id[0] : query.movie_id)
      if (!MOVIE_ID.test(movieId)) return res.status(400).json({ error: 'Unknown film.' })
      const base = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
      const upstream = await fetch(`${base}/v1/movie/${movieId}/file`, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!upstream.ok || !upstream.body) return res.status(upstream.status === 200 ? 502 : upstream.status).json({ error: 'That film is not ready yet.' })
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res as unknown as NodeJS.WritableStream)
      return
    }

    // Deliverables (script, shot list, subtitles, poster) are downloads, so they
    // stream through here for the same reason the film does: the key stays server-side.
    if (req.method === 'GET' && queryAction === 'movie-asset') {
      const key = process.env.STUDIO_API_KEY
      if (!key) return res.status(503).json({ error: 'AI artwork is not switched on for this deployment yet.' })
      const movieId = readString(Array.isArray(query.movie_id) ? query.movie_id[0] : query.movie_id)
      const asset = readString(Array.isArray(query.asset) ? query.asset[0] : query.asset)
      if (!MOVIE_ID.test(movieId)) return res.status(400).json({ error: 'Unknown film.' })
      const ASSETS: Record<string, { path: string; type: string; name: string }> = {
        script: { path: `/v1/movie/${movieId}/script`, type: 'text/markdown; charset=utf-8', name: 'script.md' },
        shotlist: { path: `/v1/movie/${movieId}/script?format=csv`, type: 'text/csv; charset=utf-8', name: 'shotlist.csv' },
        subtitles: { path: `/v1/movie/${movieId}/subtitles?format=srt`, type: 'text/plain; charset=utf-8', name: 'subtitles.srt' },
        poster: { path: `/v1/movie/${movieId}/poster`, type: 'image/jpeg', name: 'poster.jpg' },
        vertical: { path: `/v1/movie/${movieId}/vertical`, type: 'video/mp4', name: 'vertical.mp4' },
        trailer: { path: `/v1/movie/${movieId}/trailer`, type: 'video/mp4', name: 'trailer.mp4' },
      }
      const spec = ASSETS[asset]
      if (!spec) return res.status(400).json({ error: 'Unknown deliverable.' })
      const base = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
      const upstream = await fetch(base + spec.path, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'That deliverable is not ready yet.' })
      }
      res.setHeader('Content-Type', spec.type)
      res.setHeader('Content-Disposition', `attachment; filename="${spec.name}"`)
      Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res as unknown as NodeJS.WritableStream)
      return
    }

    // A browser <video> can only issue GET, so a finished clip is streamed here.
    if (req.method === 'GET' && queryAction === 'video') {
      const key = process.env.STUDIO_API_KEY
      if (!key) return res.status(503).json({ error: 'AI artwork is not switched on for this deployment yet.' })
      const jobId = readString(Array.isArray(query.job_id) ? query.job_id[0] : query.job_id)
      if (!JOB_ID.test(jobId)) return res.status(400).json({ error: 'Unknown clip.' })
      const base = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
      const upstream = await fetch(`${base}/v1/video/file/${jobId}`, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!upstream.ok || !upstream.body) return res.status(upstream.status === 200 ? 502 : upstream.status).json({ error: 'That clip is not ready.' })
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res as unknown as NodeJS.WritableStream)
      return
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Use POST.' })
    }

    const key = process.env.STUDIO_API_KEY
    if (!key) {
      return res.status(503).json({
        error: 'AI artwork is not switched on for this deployment yet.',
        detail: 'Add STUDIO_API_KEY in the Vercel project settings, then redeploy.',
      })
    }

    const validated = validateProxyBody(req.body)
    if ('error' in validated) return res.status(400).json({ error: validated.error })

    const metered = METERED_ACTIONS.includes(validated.action)
    if (metered && limiter.isLimited(clientIp(req.headers))) {
      return res.status(429).json({ error: `Limit reached: ${PER_HOUR} AI requests per hour. Try again later.` })
    }

    const upstreamBase = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
    const upstreamUrl = validated.action === 'animate-status'
      ? `${upstreamBase}/v1/video/status/${validated.payload.job_id}`
      : upstreamBase + upstreamPath(validated.action, validated.payload)
    const upstream = isReadAction(validated.action) || validated.action === 'animate-status'
      ? await fetch(upstreamUrl, {
          headers: { 'x-api-key': key },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      : await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key },
          body: JSON.stringify(upstreamBody(validated.payload)),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    if (!upstream.ok) {
      // The platform log is the only place a real server fault is visible from.
      console.warn('[studio-proxy] upstream', validated.action, 'answered', upstream.status)
    }
    const text = await upstream.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text.slice(0, 300) }
    }
    if (validated.action === 'animate-status' && parsed && typeof parsed === 'object') {
      const job = parsed as Record<string, unknown>
      // /v1/video/file/:id needs the API key, so hand the browser the public copy.
      if (job.status === 'done' && typeof job.video_url === 'string') {
        const id = job.video_url.split('/').pop()
        // Streamed through this function so the browser never needs the API key.
        job.video_url = `/api/studio?action=video&job_id=${id}`
      }
    }
    return res.status(upstream.status).json(parsed)
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
    console.error('[studio-proxy] request failed:', timedOut ? 'timeout' : String(cause))
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'The studio took too long to answer.' : 'Could not reach the studio service.',
    })
  }
}
