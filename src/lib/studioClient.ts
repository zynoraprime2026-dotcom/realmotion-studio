// Browser side of the AI studio proxy. No key, no direct studio-api calls.

export type StudioError = { message: string }

const WAKING_STATUSES = [502, 503, 504]

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    // Offline, or the platform answered with something that is not a response.
    throw new Error('Couldn\u2019t reach the studio. Check your connection and try again.')
  }
  // The render engine sleeps when nobody is filming. One patient retry wakes it
  // instead of showing the person a mystery failure.
  if (WAKING_STATUSES.includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    try {
      response = await fetch(url, init)
    } catch {
      throw new Error('The studio is still waking up. Give it a minute and try again.')
    }
    if (WAKING_STATUSES.includes(response.status)) {
      throw new Error('The studio is still waking up. Give it a minute and try again.')
    }
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

/** What the month's allowance looks like, and what each render tier costs. */
export type StudioUsage = {
  month: string
  used: number
  limit: number
  remaining: number
  movie_costs?: { storyboard: number; standard: number; high: number }
  draft_cost?: number
}

export type FilmSeries = { id: string; name: string; bible: string; created_at?: string }

export async function getUsage(): Promise<StudioUsage> {
  return post<StudioUsage>({ action: 'usage' })
}

export async function listSeries(): Promise<FilmSeries[]> {
  const response = await post<{ series?: FilmSeries[] }>({ action: 'series-list' })
  return response.series ?? []
}

export async function createSeries(name: string, bible: string): Promise<FilmSeries> {
  const created = await post<{ series_id: string; name: string; bible: string }>({ action: 'series-create', name, bible })
  return { id: created.series_id, name: created.name, bible: created.bible }
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
  series_id?: string | null
}

export type DraftRequest = DraftMovieInput & { seriesId?: string }

export async function draftMovie(input: DraftRequest): Promise<MovieDraft> {
  // seriesId rides along so the shot list is written inside the series world
  return post<MovieDraft>({ action: 'draft', ...input })
}

/** Renders the shot list a person has just reviewed. Nothing renders before this. */
export type FilmQuality = 'storyboard' | 'standard' | 'high'

export async function createMovieFromDraft(
  draftId: string,
  scenes: Pick<MovieDraftScene, 'visualPrompt' | 'narrationText' | 'duration'>[],
  title?: string,
  quality?: FilmQuality,
  seriesId?: string,
): Promise<CreateMovieResponse> {
  return post<CreateMovieResponse>({
    action: 'movie-create',
    draft_id: draftId,
    title,
    quality,
    seriesId,
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

export type CastMember = { speaker: string; lines: number; shots: string[] }

export type FilmPackage = {
  id: string
  title: string
  status: string
  language: string | null
  aspectRatio: string | null
  shots: number
  cast: CastMember[]
  deliverables: Record<string, string | null>
}

/** Who actually speaks in the cut, so a viewer knows the cast. */
export async function getFilmCast(movieId: string): Promise<CastMember[]> {
  const body = await post<{ cast?: CastMember[] }>({ action: 'movie-cast', movie_id: movieId })
  return body.cast ?? []
}

/** Every deliverable in one call: cast, deliverables, poster availability. */
export async function getFilmPackage(movieId: string): Promise<FilmPackage> {
  return post<FilmPackage>({ action: 'movie-package', movie_id: movieId })
}

/** Portrait key art built from the film's own title, style and lead prompt. */
export async function generateFilmPoster(movieId: string): Promise<{ poster: string }> {
  return post<{ poster: string }>({ action: 'movie-poster', movie_id: movieId })
}

export type FilmAsset = 'script' | 'shotlist' | 'subtitles' | 'poster' | 'vertical' | 'trailer'

/** A 9:16 master for socials, cut from the finished film. */
export async function cutVertical(movieId: string): Promise<{ url: string }> {
  return post<{ url: string }>({ action: 'movie-vertical', movie_id: movieId })
}

/** A trailer cut from the middle of the film's best shots. */
export async function cutTrailer(movieId: string): Promise<{ url: string; seconds: number }> {
  return post<{ url: string; seconds: number }>({ action: 'movie-trailer', movie_id: movieId })
}

export function filmAssetUrl(movieId: string, asset: FilmAsset): string {
  return `/api/studio?action=movie-asset&movie_id=${encodeURIComponent(movieId)}&asset=${asset}`
}

export const ACTIVE_MOVIE_STATUSES = ['queued', 'scripting', 'processing', 'assembling']
