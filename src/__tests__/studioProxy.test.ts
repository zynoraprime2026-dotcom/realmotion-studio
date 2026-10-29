import { describe, expect, it } from 'vitest'
import { clientIp, createLimiter, validateProxyBody } from '../../api/studio'

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

