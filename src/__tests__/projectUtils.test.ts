import { describe, expect, it } from 'vitest'
import { buildBrief, treatmentFileName } from '../projectUtils'
import type { Project } from '../data'

const project: Project = {
  id: 'p1',
  title: 'The Last Signal',
  prompt: 'A lighthouse keeper hears a voice on a dead radio band.',
  style: 'Cinematic',
  ratio: '16:9',
  duration: 24,
  createdAt: '2026-10-29T07:00:00.000Z',
  scenes: [
    { id: 1, title: 'Cold open', shot: 'Wide shot of the lighthouse at dusk.', duration: 8, image: 'a.webp' },
    { id: 2, title: 'The signal', shot: 'Close on the dial, needle twitching.', duration: 16, image: 'b.webp' },
  ],
}

describe('buildBrief', () => {
  it('includes the header, metadata and every scene', () => {
    const brief = buildBrief(project)
    expect(brief).toContain('REALMOTION — FILM TREATMENT')
    expect(brief).toContain('THE LAST SIGNAL')
    expect(brief).toContain('Style: Cinematic')
    expect(brief).toContain('Frame: 16:9')
    expect(brief).toContain('Duration: 24 seconds')
    expect(brief).toContain('SCENE 1 — COLD OPEN (8s)')
    expect(brief).toContain('SCENE 2 — THE SIGNAL (16s)')
    expect(brief).toContain('Close on the dial, needle twitching.')
  })

  it('keeps the story seed and states the brief is not a rendered video', () => {
    const brief = buildBrief(project)
    expect(brief).toContain(project.prompt)
    expect(brief).toContain('This is a storyboard brief, not a rendered video.')
  })

  it('orders scenes by their position in the array', () => {
    const brief = buildBrief(project)
    expect(brief.indexOf('SCENE 1')).toBeLessThan(brief.indexOf('SCENE 2'))
  })

  it('copes with a project that has no scenes', () => {
    const brief = buildBrief({ ...project, scenes: [] })
    expect(brief).toContain('SHOT PLAN')
    expect(brief).not.toContain('SCENE 1')
  })
})

describe('treatmentFileName', () => {
  it('slugifies the title', () => {
    expect(treatmentFileName(project)).toBe('the-last-signal-treatment.txt')
  })

  it('strips punctuation and collapses separators', () => {
    expect(treatmentFileName({ ...project, title: 'Neon — Requiem!! (2026)' })).toBe('neon-requiem-2026-treatment.txt')
  })

  it('falls back when the title has no usable characters', () => {
    expect(treatmentFileName({ ...project, title: 'حوار' })).toBe('realmotion-film-treatment.txt')
  })
})
