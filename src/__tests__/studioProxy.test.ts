import { describe, expect, it } from 'vitest'
import { clientIp, createLimiter, upstreamPath, validateProxyBody } from '../../api/studio'

describe('validateProxyBody', () => {
  it('rejects an unknown action and names the allowed ones', () => {
    const result = validateProxyBody({ action: 'video', prompt: 'a desert at dawn' })
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('image, content')
  })

  it('rejects a missing body', () => {
    expect(validateProxyBody(null)).toHaveProperty('error')
  })

  it('rejects a prompt that is too short', () => {
    expect(validateProxyBody({ action: 'image', prompt: 'ab' })).toHaveProperty('error')
  })

  it('accepts an image request and clamps oversized dimensions', () => {
    const result = validateProxyBody({ action: 'image', prompt: 'a lantern in fog', width: 9000, height: 100 })
    expect(result).toEqual({ action: 'image', payload: { prompt: 'a lantern in fog', width: 1536, height: 256 } })
  })

  it('defaults image dimensions when none are given', () => {
    const result = validateProxyBody({ action: 'image', prompt: 'a lantern in fog' })
    expect(result).toEqual({ action: 'image', payload: { prompt: 'a lantern in fog', width: 1024, height: 1536 } })
  })

  it('defaults the content type and rejects an empty topic', () => {
    expect(validateProxyBody({ action: 'content', topic: 'a map that redraws itself' })).toEqual({
      action: 'content',
      payload: { type: 'shorts_script', topic: 'a map that redraws itself' },
    })
    expect(validateProxyBody({ action: 'content', topic: '' })).toHaveProperty('error')
  })
})

describe('createLimiter', () => {
  it('allows the limit then blocks, and forgets the window', () => {
    let clock = 0
    const limiter = createLimiter(2, 1000, () => clock)
    expect(limiter.isLimited('1.2.3.4')).toBe(false)
    expect(limiter.isLimited('1.2.3.4')).toBe(false)
    expect(limiter.isLimited('1.2.3.4')).toBe(true)
    expect(limiter.isLimited('5.6.7.8')).toBe(false)
    clock = 1500
    expect(limiter.isLimited('1.2.3.4')).toBe(false)
  })
})

describe('clientIp', () => {
  it('prefers the left-most forwarded address', () => {
    expect(clientIp({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })).toBe('203.0.113.9')
  })

  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp({ 'x-real-ip': '198.51.100.4' })).toBe('198.51.100.4')
    expect(clientIp({})).toBe('unknown')
  })
})

describe('validateProxyBody: animation', () => {
  it('requires an https image to animate', () => {
    const result = validateProxyBody({ action: 'animate', image_url: 'http://insecure.example/a.jpg' })
    expect(result).toHaveProperty('error')
  })

  it('defaults to a 5 second clip and never exceeds the provider ceiling', () => {
    const base = { action: 'animate', image_url: 'https://example.com/a.jpg', prompt: 'slow push in' }
    expect(validateProxyBody(base)).toMatchObject({ payload: { duration: 5 } })
    expect(validateProxyBody({ ...base, duration: 30 })).toMatchObject({ payload: { duration: 10 } })
    expect(validateProxyBody({ ...base, duration: 1 })).toMatchObject({ payload: { duration: 2 } })
  })

  it('only accepts a plausible job id when polling', () => {
    expect(validateProxyBody({ action: 'animate-status', job_id: '../../etc/passwd' })).toHaveProperty('error')
    const ok = validateProxyBody({ action: 'animate-status', job_id: '0d1f5a3e-2b44-4c19-9f0a-77a1b2c3d4e5' })
    expect(ok).toMatchObject({ action: 'animate-status' })
  })
})


describe('validateProxyBody: the film list', () => {
  it('accepts movie-list with no arguments', () => {
    expect(validateProxyBody({ action: 'movie-list' })).toEqual({ action: 'movie-list', payload: {} })
  })

  it('reads the list from /v1/movie/list', () => {
    expect(upstreamPath('movie-list', {})).toBe('/v1/movie/list')
  })
})

describe('validateProxyBody: the deliverable package', () => {
  const id = 'mov_1234abcd-0000-1111-2222-333344445555'

  it('accepts cast, package and poster for a real film id', () => {
    for (const action of ['movie-cast', 'movie-package', 'movie-poster'] as const) {
      expect(validateProxyBody({ action, movie_id: id })).toEqual({ action, payload: { movie_id: id } })
    }
  })

  it('refuses a film id that is not one of ours', () => {
    for (const action of ['movie-cast', 'movie-package', 'movie-poster'] as const) {
      expect(validateProxyBody({ action, movie_id: '../../etc/passwd' })).toHaveProperty('error')
    }
  })

  it('maps each one onto its upstream route', () => {
    expect(upstreamPath('movie-cast', { movie_id: id })).toBe(`/v1/movie/${id}/cast`)
    expect(upstreamPath('movie-package', { movie_id: id })).toBe(`/v1/movie/${id}/package`)
    expect(upstreamPath('movie-poster', { movie_id: id })).toBe(`/v1/movie/${id}/poster`)
  })
})


describe('validateProxyBody: the re-cuts', () => {
  const id = 'mov_1234abcd-0000-1111-2222-333344445555'

  it('accepts a vertical re-cut and a trailer for a real film', () => {
    expect(validateProxyBody({ action: 'movie-vertical', movie_id: id })).toEqual({ action: 'movie-vertical', payload: { movie_id: id } })
    expect(validateProxyBody({ action: 'movie-trailer', movie_id: id })).toEqual({ action: 'movie-trailer', payload: { movie_id: id } })
  })

  it('sends the vertical cut to the re-cut route, not a /vertical POST', () => {
    expect(upstreamPath('movie-vertical', { movie_id: id })).toBe(`/v1/movie/${id}/re-cut`)
    expect(upstreamPath('movie-trailer', { movie_id: id })).toBe(`/v1/movie/${id}/trailer`)
  })
})


describe('allowance and series', () => {
  it('reads usage and the series list without a body', () => {
    expect(validateProxyBody({ action: 'usage' })).toEqual({ action: 'usage', payload: {} })
    expect(validateProxyBody({ action: 'series-list' })).toEqual({ action: 'series-list', payload: {} })
    expect(upstreamPath('usage', {})).toBe('/v1/usage')
    expect(upstreamPath('series-list', {})).toBe('/v1/series')
  })

  it('needs a name before it will save a series bible', () => {
    expect(validateProxyBody({ action: 'series-create', name: '', bible: 'x' })).toHaveProperty('error')
    expect(validateProxyBody({ action: 'series-create', name: 'Zanj Cycle', bible: 'indigo and ochre' }))
      .toEqual({ action: 'series-create', payload: { name: 'Zanj Cycle', bible: 'indigo and ochre' } })
  })

  it('takes a series id on a draft, and rejects a nonsense one', () => {
    const base = { action: 'draft', prompt: 'A sailmaker follows a compass that points down.', aspectRatio: '16:9', scenes: 5 }
    expect(validateProxyBody({ ...base, seriesId: 'ser_3fb55b9e-5ef9-49e9-acd9-e5e9094cf0ed' })).not.toHaveProperty('error')
    expect(validateProxyBody({ ...base, seriesId: 'nope' })).toHaveProperty('error')
  })
})
