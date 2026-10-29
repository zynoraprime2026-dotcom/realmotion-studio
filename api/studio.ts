// Serverless proxy in front of studio-api. Self-contained on purpose: the Vercel
// Node runtime is happiest with a single file per function, and every cross-file
// import here previously failed at load time with FUNCTION_INVOCATION_FAILED.

type MinimalRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

type MinimalResponse = {
  status: (code: number) => MinimalResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

const ALLOWED_ACTIONS = ['image', 'content'] as const
type StudioAction = (typeof ALLOWED_ACTIONS)[number]

const MIN_DIMENSION = 256
const MAX_DIMENSION = 1536
const MAX_PROMPT = 1200
const MAX_TOPIC = 300

const PATHS: Record<StudioAction, string> = {
  image: '/v1/image/generate',
  content: '/v1/content/generate',
}

type Validated =
  | { action: StudioAction; payload: Record<string, string | number> }
  | { error: string }

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

  const topic = readString(raw.topic)
  if (topic.length < 3) return { error: 'Describe the topic in at least 3 characters.' }
  if (topic.length > MAX_TOPIC) return { error: `Keep the topic under ${MAX_TOPIC} characters.` }
  const type = readString(raw.type) || 'shorts'
  if (type.length > 40) return { error: 'Keep the content type under 40 characters.' }
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

    if (limiter.isLimited(clientIp(req.headers))) {
      return res.status(429).json({ error: `Limit reached: ${PER_HOUR} AI requests per hour. Try again later.` })
    }

    const upstreamBase = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
    const upstream = await fetch(upstreamBase + PATHS[validated.action], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(validated.payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await upstream.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text.slice(0, 300) }
    }
    return res.status(upstream.status).json(parsed)
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'The studio took too long to answer.' : 'Could not reach the studio service.',
    })
  }
}
