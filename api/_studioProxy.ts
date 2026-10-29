// Request shape and guard rails for the studio-api proxy.
//
// Kept free of Node and browser APIs so it can be unit tested and reused by the
// serverless handler. The API key never passes through here; the handler reads it
// from the environment.

export const ALLOWED_ACTIONS = ['image', 'content'] as const
export type StudioAction = (typeof ALLOWED_ACTIONS)[number]

export type ValidatedRequest = {
  action: StudioAction
  payload: { prompt: string; width: number; height: number } | { type: string; topic: string }
}

const MIN_DIMENSION = 256
const MAX_DIMENSION = 1536
const MAX_PROMPT = 1200
const MAX_TOPIC = 300

function clampDimension(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(parsed)))
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Returns a validated request, or a human readable reason it was rejected. */
export function validateProxyBody(body: unknown): ValidatedRequest | { error: string } {
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
      payload: {
        prompt,
        width: clampDimension(raw.width, 1024),
        height: clampDimension(raw.height, 1536),
      },
    }
  }

  const topic = readString(raw.topic)
  if (topic.length < 3) return { error: 'Describe the topic in at least 3 characters.' }
  if (topic.length > MAX_TOPIC) return { error: `Keep the topic under ${MAX_TOPIC} characters.` }
  const type = readString(raw.type) || 'shorts'
  if (type.length > 40) return { error: 'Keep the content type under 40 characters.' }
  return { action: 'content', payload: { type, topic } }
}

export type Limiter = { isLimited: (key: string) => boolean }

/** Sliding-window limiter. Per instance, so each serverless container is counted separately. */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now): Limiter {
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
