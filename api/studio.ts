// Serverless proxy in front of the studio-api.
//
// The browser never holds the API key: it posts to /api/studio, this function
// attaches the key server-side and forwards only the two endpoints the app uses.
// Deploy target is Vercel, where every file in api/ becomes an endpoint.

import {
  clientIp,
  createLimiter,
  validateProxyBody,
  type StudioAction,
} from './_studioProxy'

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

const UPSTREAM = (process.env.STUDIO_API_URL || 'https://studio-api-nqpm.onrender.com').replace(/\/+$/, '')
const PER_HOUR = Number(process.env.STUDIO_PROXY_LIMIT) || 10
const TIMEOUT_MS = 30_000

const limiter = createLimiter(PER_HOUR, 60 * 60 * 1000)

const PATHS: Record<StudioAction, string> = {
  image: '/v1/image/generate',
  content: '/v1/content/generate',
}

export default async function handler(req: MinimalRequest, res: MinimalResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use POST.' })
  }

  const key = process.env.STUDIO_API_KEY
  if (!key) {
    return res.status(503).json({
      error: 'AI artwork is not switched on for this deployment yet.',
      detail: 'Set STUDIO_API_KEY (and optionally STUDIO_API_URL) in the Vercel project, then redeploy.',
    })
  }

  const validated = validateProxyBody(req.body)
  if ('error' in validated) return res.status(400).json({ error: validated.error })

  if (limiter.isLimited(clientIp(req.headers))) {
    return res.status(429).json({ error: `Limit reached: ${PER_HOUR} AI requests per hour. Try again later.` })
  }

  try {
    const upstream = await fetch(UPSTREAM + PATHS[validated.action], {
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
