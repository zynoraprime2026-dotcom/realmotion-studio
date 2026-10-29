// Browser side of the AI studio proxy. No key, no direct studio-api calls.

export type StudioError = { message: string }

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

export async function generateContent(topic: string, type = 'shorts'): Promise<string> {
  const payload = await post<Record<string, unknown>>({ action: 'content', topic, type })
  for (const field of ['text', 'content', 'script', 'output'] as const) {
    const value = payload[field]
    if (typeof value === 'string' && value.trim()) return value
  }
  throw new Error('The studio answered without any text.')
}
