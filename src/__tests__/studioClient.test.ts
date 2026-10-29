import { afterEach, describe, expect, it, vi } from 'vitest'
import { animateScene, generateContent, generateKeyArt, videoStatus } from '../lib/studioClient'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('studioClient', () => {
  it('turns a network failure into a sentence a person can act on', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch
    await expect(generateKeyArt('a long enough prompt for art', 512, 512)).rejects.toThrow(/check your connection/i)
  })

  it('keeps the server explanation when the proxy rejects the request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Limit reached: 10 AI requests per hour. Try again later.' }),
    }) as unknown as typeof fetch
    await expect(generateKeyArt('a long enough prompt for art', 512, 512)).rejects.toThrow(/10 AI requests per hour/)
  })

  it('falls back to the status code when the body is not JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('not json') },
    }) as unknown as typeof fetch
    await expect(generateContent('a topic worth a script')).rejects.toThrow(/\(502\)/)
  })

  it('accepts the media URL under any of the fields studio-api uses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ media_url: 'https://example.com/a.jpg' }),
    }) as unknown as typeof fetch
    await expect(generateKeyArt('a long enough prompt for art', 512, 512)).resolves.toBe('https://example.com/a.jpg')
  })

  it('rejects a successful response that carries no image', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch
    await expect(generateKeyArt('a long enough prompt for art', 512, 512)).rejects.toThrow(/without an image URL/)
  })
})

describe('animation calls', () => {
  it('returns the job id from a 202', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ job_id: 'abc-123', status_url: '/v1/video/status/abc-123' }),
    }) as unknown as typeof fetch
    await expect(animateScene('https://example.com/a.jpg', 'push in')).resolves.toBe('abc-123')
  })

  it('refuses an accepted job that carries no id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ ok: true }),
    }) as unknown as typeof fetch
    await expect(animateScene('https://example.com/a.jpg', 'push in')).rejects.toThrow(/did not return an animation job/)
  })

  it('normalises a finished job', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'done', progress: 100, video_url: 'https://example.com/clip.mp4' }),
    }) as unknown as typeof fetch
    await expect(videoStatus('abc-123')).resolves.toEqual({
      status: 'done',
      progress: 100,
      videoUrl: 'https://example.com/clip.mp4',
      error: null,
    })
  })
})

