// Browser side of the AI studio proxy. No key, no direct studio-api calls.

export type StudioError = { message: string }

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
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

async function post<T>(body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

/* -------------------------------------------------------------------------- */
/* DIRECTOR MODE API                                                          */
/* -------------------------------------------------------------------------- */

/** A shot as the studio drafts it. Ids are short strings ("s1"), not numbers. */
export type MovieDraftScene = {
  id: string
  shot: string | null
  visualPrompt: string
  narrationText: string
  duration: number
  imagePrompt: string | null
  image: string | null
}

export type MovieDraftSuggested = {
  aspectRatio: '16:9' | '9:16'
  narratorVoice: string
  musicMood: string
  titleCard: boolean
  burnSubtitles: boolean
  crossfade: boolean
  continuity: 'chained' | 'independent'
  narrationRate: string
}

export type MovieDraft = {
  draft_id: string
  expires_at: string
  title: string
  logline: string | null
  style_bible: string | null
  character: string | null
  scenes: MovieDraftScene[]
  suggested: MovieDraftSuggested
  /** the draft's own admission of problems, e.g. narration longer than its shot */
  notes: string[]
}

export type DraftMovieInput = {
  prompt: string
  style?: string
  language?: string
  aspectRatio?: '16:9' | '9:16'
  scenes?: number
  duration?: number
}

export type MovieSceneStatus = {
  id: string
  imageUrl: string | null
  clipUrl: string | null
  clipSource: string | null
  clipError: string | null
  imageError: string | null
  narrationError: string | null
  narrationDuration: number | null
  startsFrom: string | null
  duration: number | null
  visualPrompt: string | null
  narration: string | null
  reShotAt: string | null
}

export type MovieStatus = {
  id: string
  title: string
  status: 'queued' | 'scripting' | 'processing' | 'assembling' | 'done' | 'partial' | 'failed' | string
  progress: number | null
  step: string | null
  error: string | null
  assemblyStale: boolean
  continuity: string
  scenes: MovieSceneStatus[]
}

export type MovieSuggestion = {
  id: string
  kind: 're-shoot' | 'assemble' | 'narration' | 'info' | string
  scene: number | null
  severity: 'high' | 'medium' | 'low' | string
  title: string
  message: string
  /** the call the server says would fix it; the UI acts on kind + scene instead */
  action: { method: string; path: string; body?: Record<string, unknown> } | null
}

export type MovieSuggestions = {
  movie_id: string
  status: string
  suggestions: MovieSuggestion[]
  count: number
  note: string
}

export type CreateMovieResponse = {
  movie_id: string
  status: string
  poll?: string
  continuity?: string
  draft_id?: string | null
  cost?: string
}

export async function draftMovie(input: DraftMovieInput): Promise<MovieDraft> {
  return post<MovieDraft>({ action: 'draft', ...input })
}

/** Renders the shot list a person has just reviewed. Nothing renders before this. */
export async function createMovieFromDraft(
  draftId: string,
  scenes: Pick<MovieDraftScene, 'visualPrompt' | 'narrationText' | 'duration'>[],
  title?: string,
): Promise<CreateMovieResponse> {
  return post<CreateMovieResponse>({
    action: 'movie-create',
    draft_id: draftId,
    title,
    scenes: scenes.map((scene) => ({
      visualPrompt: scene.visualPrompt.trim(),
      narrationText: scene.narrationText.trim(),
      duration: scene.duration,
    })),
  })
}

export async function getMovie(movieId: string): Promise<MovieStatus> {
  return post<MovieStatus>({ action: 'movie-status', movie_id: movieId })
}

export async function getMovieSuggestions(movieId: string): Promise<MovieSuggestions> {
  return post<MovieSuggestions>({ action: 'movie-suggestions', movie_id: movieId })
}

/** Re-does one shot. `scene` is 1-based, the way the shot list is numbered. */
export async function reshootScene(movieId: string, scene: number): Promise<{ status: string }> {
  return post<{ status: string }>({ action: 'movie-reshoot', movie_id: movieId, scene })
}

export async function assembleMovie(movieId: string): Promise<{ status: string }> {
  return post<{ status: string }>({ action: 'movie-assemble', movie_id: movieId })
}

/** A <video> tag can only GET, so the finished film streams through the proxy. */
export function filmUrl(movieId: string): string {
  return `/api/studio?action=movie&movie_id=${encodeURIComponent(movieId)}`
}

export type MovieSummary = {
  id: string
  title: string
  status: string
  progress: number | null
  created_at: string | null
}

/** Every film this deployment's key has made, newest first. */
export async function listMovies(): Promise<MovieSummary[]> {
  const body = await post<{ movies?: MovieSummary[]; items?: MovieSummary[] }>({ action: 'movie-list' })
  return body.movies ?? body.items ?? []
}

export const ACTIVE_MOVIE_STATUSES = ['queued', 'scripting', 'processing', 'assembling']
