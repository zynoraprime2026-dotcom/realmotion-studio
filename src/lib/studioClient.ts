// Browser side of the AI studio proxy. No key, no direct studio-api calls.

export type StudioError = { message: string }

async function post<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Offline, or the platform answered with something that is not a response.
    throw new Error('Couldn\u2019t reach the studio. Check your connection and try again.')
  }
  const payload: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Studio request failed (${response.status}).`
    throw new Error(message)
  }
  return payload as T
}

/** Studio-api returns the media URL under `url`, `image_url` or `media_url` depending on version. */
function firstUrl(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    for (const field of ['url', 'image_url', 'media_url'] as const) {
      const value = (payload as Record<string, unknown>)[field]
      if (typeof value === 'string' && value.startsWith('http')) return value
    }
  }
  throw new Error('The studio answered without an image URL.')
}

export async function generateKeyArt(prompt: string, width: number, height: number): Promise<string> {
  return firstUrl(await post({ action: 'image', prompt, width, height }))
}

export async function generateContent(topic: string, type = 'shorts_script'): Promise<string> {
  const payload = await post<Record<string, unknown>>({ action: 'content', topic, type })
  for (const field of ['text', 'content', 'script', 'output'] as const) {
    const value = payload[field]
    if (typeof value === 'string' && value.trim()) return value
  }
  throw new Error('The studio answered without any text.')
}

export type VideoStatus = {
  status: string
  progress: number
  videoUrl: string | null
  error: string | null
  /** provider:slug of the model that rendered the clip, once known */
  model: string | null
}

/** Turns "replicate:kwaivgi/kling-v2.5-turbo-pro" into something readable. */
export function modelLabel(model: string | null): string {
  if (!model) return ''
  const slug = model.includes(':') ? model.slice(model.indexOf(':') + 1) : model
  const name = slug.split('/').filter(Boolean).pop() || slug
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Hands a still to the studio and returns the job id to poll. */
export async function animateScene(imageUrl: string, prompt: string, duration = 5): Promise<string> {
  const payload = await post<Record<string, unknown>>({ action: 'animate', image_url: imageUrl, prompt, duration })
  const jobId = payload.job_id
  if (typeof jobId !== 'string' || !jobId) throw new Error('The studio did not return an animation job.')
  return jobId
}

export async function videoStatus(jobId: string): Promise<VideoStatus> {
  const payload = await post<Record<string, unknown>>({ action: 'animate-status', job_id: jobId })
  return {
    status: typeof payload.status === 'string' ? payload.status : 'unknown',
    progress: typeof payload.progress === 'number' ? payload.progress : 0,
    videoUrl: typeof payload.video_url === 'string' ? payload.video_url : null,
    error: typeof payload.error === 'string' ? payload.error : null,
    model: typeof payload.model === 'string' ? payload.model : null,
  }
}
