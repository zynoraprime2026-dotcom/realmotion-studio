import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  animateScene,
  createMovieFromDraft,
  draftMovie,
  filmUrl,
  generateContent,
  generateKeyArt,
  getMovie,
  getMovieSuggestions,
  reshootScene,
  videoStatus,
} from '../lib/studioClient'

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
      json: async () => {
        throw new SyntaxError('not json')
      },
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
      model: null,
    })
  })
})

describe('director mode calls', () => {
  const mockJson = (body: unknown, status = 200) => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    return mockFetch
  }

  it('drafts a shot list through the proxy, never straight at studio-api', async () => {
    const draft = {
      draft_id: 'drf_abc12345',
      expires_at: '2026-11-06T00:00:00.000Z',
      title: 'Compass of Truth',
      logline: 'A girl follows a compass across the Swahili coast.',
      style_bible: 'warm salt light, 35mm',
      character: '16-year-old mapmaker in teal',
      scenes: [{ id: 's1', shot: 'WIDE', visualPrompt: 'a dhow at dawn', narrationText: 'She seeks her father.', duration: 5, imagePrompt: null, image: null }],
      suggested: { aspectRatio: '16:9', narratorVoice: 'en-US-AriaNeural', musicMood: 'dramatic', titleCard: true, burnSubtitles: true, crossfade: true, continuity: 'chained', narrationRate: '+0%' },
      notes: [],
    }
    const mockFetch = mockJson(draft)

    const result = await draftMovie({ prompt: 'an adventure across the Swahili coast', scenes: 5 })

    expect(mockFetch).toHaveBeenCalledWith('/api/studio', expect.objectContaining({ method: 'POST' }))
    const sent = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(sent).toEqual({ action: 'draft', prompt: 'an adventure across the Swahili coast', scenes: 5 })
    expect(result.scenes[0].id).toBe('s1')
    expect(result.suggested.continuity).toBe('chained')
  })

  it('renders only the shot list it is handed, trimmed', async () => {
    const mockFetch = mockJson({ movie_id: 'mov_abc12345', status: 'queued' }, 202)

    await createMovieFromDraft(
      'drf_abc12345',
      [{ visualPrompt: '  a dhow at dawn  ', narrationText: '  She seeks her father.  ', duration: 5 }],
      'Compass of Zanj',
    )

    const sent = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(sent).toEqual({
      action: 'movie-create',
      draft_id: 'drf_abc12345',
      title: 'Compass of Zanj',
      scenes: [{ visualPrompt: 'a dhow at dawn', narrationText: 'She seeks her father.', duration: 5 }],
    })
  })

  it('reads status and suggestions as proxy actions', async () => {
    const mockFetch = mockJson({ movie_id: 'mov_abc12345', status: 'done', suggestions: [], count: 0, note: 'nothing to fix' })

    await getMovie('mov_abc12345')
    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ action: 'movie-status', movie_id: 'mov_abc12345' })

    await getMovieSuggestions('mov_abc12345')
    expect(JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({ action: 'movie-suggestions', movie_id: 'mov_abc12345' })
  })

  it('re-shoots the 1-based scene number the shot list shows', async () => {
    const mockFetch = mockJson({ status: 're-shooting' }, 202)

    await reshootScene('mov_abc12345', 2)

    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      action: 'movie-reshoot',
      movie_id: 'mov_abc12345',
      scene: 2,
    })
  })

  it('streams the finished film through the proxy, because a video tag can only GET', () => {
    expect(filmUrl('mov_abc12345')).toBe('/api/studio?action=movie&movie_id=mov_abc12345')
  })
})
