import { useCallback, useEffect, useState } from 'react'
import { Clapperboard, Loader2, RefreshCw, Scissors, Sparkles, Wand2 } from 'lucide-react'
import {
  ACTIVE_MOVIE_STATUSES,
  assembleMovie,
  createMovieFromDraft,
  draftMovie,
  filmAssetUrl,
  filmUrl,
  generateFilmPoster,
  getFilmPackage,
  getMovie,
  getMovieSuggestions,
  listMovies,
  reshootScene,
  type FilmPackage,
  type MovieDraft,
  type MovieDraftScene,
  type MovieStatus,
  type MovieSuggestion,
  type MovieSummary,
} from '../lib/studioClient'

const examplePrompt =
  'A teenage girl in Mombasa stows away on a dhow to find her missing father in Zanzibar, following a brass compass that only points at what is true. Salt air, monsoon storms, lantern-lit harbours.'

const shotCounts = [4, 5, 6, 7, 8]
const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 }
const isActive = (status: string) => ACTIVE_MOVIE_STATUSES.includes(status)

type DirectorProps = {
  notify: (message: string) => void
  /** The nav shows how many films this deployment has actually made. */
  onFilms?: (count: number) => void
}

type Stage = 'write' | 'review' | 'film'

export function Director({ notify, onFilms }: DirectorProps) {
  const [stage, setStage] = useState<Stage>('write')
  const [prompt, setPrompt] = useState(examplePrompt)
  const [ratio, setRatio] = useState<'16:9' | '9:16'>('16:9')
  const [shotCount, setShotCount] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<MovieDraft | null>(null)
  const [title, setTitle] = useState('')
  const [shots, setShots] = useState<MovieDraftScene[]>([])
  const [movie, setMovie] = useState<MovieStatus | null>(null)
  const [suggestions, setSuggestions] = useState<MovieSuggestion[]>([])
  const [workingScene, setWorkingScene] = useState<number | null>(null)
  const [library, setLibrary] = useState<MovieSummary[]>([])
  const [libraryError, setLibraryError] = useState('')
  const [pack, setPack] = useState<FilmPackage | null>(null)
  const [posterBusy, setPosterBusy] = useState(false)

  const refreshLibrary = useCallback(() => {
    listMovies()
      .then((rows) => { setLibrary(rows); setLibraryError('') })
      .catch((e: unknown) => setLibraryError(e instanceof Error ? e.message : 'Could not reach the studio API.'))
  }, [])

  useEffect(() => {
    let alive = true
    listMovies()
      .then((rows) => { if (alive) { setLibrary(rows); setLibraryError('') } })
      .catch((e: unknown) => { if (alive) setLibraryError(e instanceof Error ? e.message : 'Could not reach the studio API.') })
    return () => { alive = false }
  }, [])

  useEffect(() => { onFilms?.(library.length) }, [library.length, onFilms])

  // The production package: cast, deliverables, whether a poster exists.
  useEffect(() => {
    if (!movie || isActive(movie.status) || movie.status === 'queued') return
    let alive = true
    getFilmPackage(movie.id).then((p) => { if (alive) setPack(p) }).catch(() => { if (alive) setPack(null) })
    return () => { alive = false }
  }, [movie])

  const makePoster = async () => {
    if (!movie) return
    setPosterBusy(true)
    try {
      await generateFilmPoster(movie.id)
      setPack(await getFilmPackage(movie.id))
      notify('Poster ready. It is in the file list below.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The poster could not be made.')
    } finally {
      setPosterBusy(false)
    }
  }

  // one poll per status change: a finished film stops the loop on its own
  const movieId = movie?.id
  const movieStatus = movie?.status ?? ''
  useEffect(() => {
    if (!movieId || !isActive(movieStatus)) return
    const timer = window.setTimeout(() => {
      getMovie(movieId)
        .then((status) => {
          setMovie(status)
          if (status.status === 'done' || status.status === 'partial') {
            getMovieSuggestions(movieId)
              .then((advice) => setSuggestions(advice.suggestions))
              .catch(() => setSuggestions([]))
            if (status.status === 'done') notify('Your film is cut and ready.')
            refreshLibrary()
          }
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Lost contact with the studio while polling.'))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [movieId, movieStatus, notify, refreshLibrary])

  const openFilm = async (summary: MovieSummary) => {
    setStage('film')
    setDraft(null)
    setError('')
    setSuggestions([])
    setMovie({ id: summary.id, title: summary.title, status: summary.status, progress: summary.progress ?? 0, step: null, error: null, assemblyStale: false, continuity: 'chained', scenes: [] })
    if (!isActive(summary.status)) {
      getMovieSuggestions(summary.id)
        .then((advice) => setSuggestions(advice.suggestions))
        .catch(() => setSuggestions([]))
    }
  }

  const writeDraft = async () => {
    if (prompt.trim().length < 24) {
      setError('Give the director a little more story: at least 24 characters.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const next = await draftMovie({ prompt: prompt.trim(), aspectRatio: ratio, scenes: shotCount })
      setDraft(next)
      setTitle(next.title)
      setShots(next.scenes)
      setStage('review')
      notify(`${next.scenes.length} shots drafted. Nothing has been rendered yet.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The studio could not draft that shot list.')
    } finally {
      setBusy(false)
    }
  }

  const patchShot = (id: string, patch: Partial<MovieDraftScene>) => {
    setShots((current) => current.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)))
  }

  const renderFilm = async () => {
    if (!draft) return
    if (shots.some((shot) => shot.visualPrompt.trim().length < 4 || shot.narrationText.trim().length < 4)) {
      setError('Every shot needs an on-screen description and one line of voice-over.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const created = await createMovieFromDraft(
        draft.draft_id,
        shots.map((shot) => ({ visualPrompt: shot.visualPrompt, narrationText: shot.narrationText, duration: shot.duration })),
        title.trim() || draft.title,
      )
      setStage('film')
      setMovie({ id: created.movie_id, title: title.trim() || draft.title, status: 'queued', progress: 0, step: null, error: null, assemblyStale: false, continuity: created.continuity ?? 'chained', scenes: [] })
      notify('Rendering: stills, then chained shots, then the cut.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The studio could not start that render.')
    } finally {
      setBusy(false)
    }
  }

  const fixScene = async (scene: number) => {
    if (!movie) return
    setWorkingScene(scene)
    try {
      await reshootScene(movie.id, scene)
      setStage('film')
      notify(`Re-shooting shot ${scene}. The rest of the film is kept.`)
      setMovie({ ...movie, status: 'processing', step: 're-shoot', progress: 5, error: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That shot could not be re-shot.')
    } finally {
      setWorkingScene(null)
    }
  }

  const recut = async () => {
    if (!movie) return
    setBusy(true)
    try {
      await assembleMovie(movie.id)
      setMovie({ ...movie, status: 'assembling', step: 'assembly', progress: 90, error: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The cut could not be rebuilt.')
    } finally {
      setBusy(false)
    }
  }

  const startOver = () => {
    setStage('write')
    setDraft(null)
    setShots([])
    setMovie(null)
    setSuggestions([])
    setError('')
  }

  const ordered = [...suggestions].sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))
  const rendered = library.filter((entry) => !isActive(entry.status))

  return (
    <section className="director" id="films">
      <div className="section-heading page-gutter">
        <p className="eyebrow">DIRECTOR MODE</p>
        <h2>Write the spark.<br />Approve the shots. Watch the film.</h2>
        <p className="section-summary dark-ink">A prompt becomes an editable shot list before anything is paid for. Approve it and the studio renders stills, chains each shot onto the last frame of the one before, adds the voice-over, music and subtitles, then cuts the film. Finished films play here, not in your browser's storage.</p>
      </div>

      <div className="page-gutter">
        {stage === 'write' && (
          <div className="director-grid">
            <div className="director-panel">
              <label className="field-label" htmlFor="director-prompt">THE FILM</label>
              <textarea id="director-prompt" className="director-textarea" rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <div className="director-controls">
                <fieldset className="director-fieldset">
                  <legend className="field-label">FRAME</legend>
                  <div className="chip-row">
                    {(['16:9', '9:16'] as const).map((option) => (
                      <button key={option} type="button" className={`chip ${ratio === option ? 'chip-active' : ''}`} onClick={() => setRatio(option)} aria-pressed={ratio === option}>{option}</button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="director-fieldset">
                  <legend className="field-label">SHOTS</legend>
                  <div className="chip-row">
                    {shotCounts.map((count) => (
                      <button key={count} type="button" className={`chip ${shotCount === count ? 'chip-active' : ''}`} onClick={() => setShotCount(count)} aria-pressed={shotCount === count}>{count}</button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <button type="button" className="director-button" onClick={writeDraft} disabled={busy}>
                {busy ? <><Loader2 size={17} className="spin" /> Drafting shots…</> : <><Wand2 size={17} /> Draft the shot list</>}
              </button>
              <p className="director-note">DRAFTING IS FREE · NOTHING RENDERS UNTIL YOU APPROVE THE SHOTS</p>
            </div>

            <aside className="director-library">
              <p className="field-label">MADE ON THIS DEPLOYMENT</p>
              {libraryError && <p className="director-error" role="alert">The film list could not be loaded: {libraryError}</p>}
              {!libraryError && library.length === 0 && <p className="director-empty">No films yet. The first one you approve will appear here with its cut.</p>}
              <ul>
                {library.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="library-row" onClick={() => openFilm(entry)}>
                      <span className="library-title">{entry.title}</span>
                      <span className={`library-status status-${entry.status}`}>{entry.status}{isActive(entry.status) ? ` ${entry.progress ?? 0}%` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {library.length > 0 && <button type="button" className="text-action" onClick={() => void refreshLibrary()}>Refresh list</button>}
            </aside>
          </div>
        )}

        {stage === 'review' && draft && (
          <div className="director-panel director-panel-wide">
            <div className="director-head">
              <div>
                <p className="eyebrow dark-ink">SHOT LIST · NOTHING RENDERED YET</p>
                <input className="director-title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Film title" />
                {draft.logline && <p className="director-logline">{draft.logline}</p>}
              </div>
              <button type="button" className="text-action" onClick={startOver}>Discard</button>
            </div>

            {draft.notes.length > 0 && (
              <ul className="director-notes">{draft.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            )}

            <ol className="shot-list">
              {shots.map((shot, index) => (
                <li key={shot.id} className="shot-card">
                  <div className="shot-head">
                    <span className="shot-number">SHOT {String(index + 1).padStart(2, '0')}</span>
                    <span className="shot-meta">{shot.duration}s · {shot.narrationText.trim().split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                  <label className="shot-label">
                    <span>ON SCREEN</span>
                    <textarea rows={3} value={shot.visualPrompt} onChange={(event) => patchShot(shot.id, { visualPrompt: event.target.value })} />
                  </label>
                  <label className="shot-label">
                    <span>VOICE OVER</span>
                    <textarea rows={2} value={shot.narrationText} onChange={(event) => patchShot(shot.id, { narrationText: event.target.value })} />
                  </label>
                </li>
              ))}
            </ol>

            {error && <p className="director-error" role="alert">{error}</p>}
            <div className="director-actions">
              <p className="director-note">RENDER: STILLS → CHAINED SHOTS → VOICE → MUSIC → SUBTITLES → CUT</p>
              <button type="button" className="director-button" onClick={renderFilm} disabled={busy}>
                {busy ? <><Loader2 size={17} className="spin" /> Starting…</> : <><Clapperboard size={17} /> Render this film</>}
              </button>
            </div>
          </div>
        )}

        {stage === 'film' && movie && (
          <div className="director-panel director-panel-wide">
            <div className="director-head">
              <div>
                <p className="eyebrow dark-ink">{movie.title}</p>
                <p className="director-logline">
                  {isActive(movie.status)
                    ? `${movie.step ?? 'queued'} · ${movie.progress ?? 0}%`
                    : movie.status === 'done'
                      ? `cut · ${movie.status}`
                      : movie.status}
                </p>
              </div>
              <div className="director-head-actions">
                <button type="button" className="text-action" onClick={() => { setStage('write'); void refreshLibrary() }}>All films</button>
                <button type="button" className="text-action" onClick={startOver}>New film</button>
              </div>
            </div>

            {isActive(movie.status) || movie.status === 'queued' ? (
              <div className="director-progress" role="status" aria-live="polite">
                <div className="director-progress-bar"><i style={{ width: `${Math.max(4, movie.progress ?? 0)}%` }} /></div>
                <p>Each shot starts on the last frame of the one before, so the film holds together. A five shot film takes a few minutes on the free instance.</p>
              </div>
            ) : (
              <video className="director-player" src={filmUrl(movie.id)} controls playsInline preload="metadata" />
            )}

            {movie.error && <p className="director-error" role="alert">{movie.error}</p>}

            {pack && pack.id === movie.id && !isActive(movie.status) && movie.status !== 'queued' && (
              <div className="director-delivery">
                <h3>The finished film, as files</h3>
                {pack.cast.length > 0 && (
                  <p className="director-cast">
                    <span className="field-label">CAST</span>{' '}
                    {pack.cast.map((c) => `${c.speaker} (${c.lines} ${c.lines === 1 ? 'line' : 'lines'})`).join(' · ')}
                  </p>
                )}
                <div className="delivery-grid">
                  {pack.deliverables.poster && (
                    <a className="delivery-poster" href={filmAssetUrl(movie.id, 'poster')} download>
                      <img src={filmAssetUrl(movie.id, 'poster')} alt={`Poster for ${movie.title}`} loading="lazy" />
                      <span>Poster</span>
                    </a>
                  )}
                  <div className="delivery-links">
                    <a href={filmAssetUrl(movie.id, 'script')} download>Reading script (.md)</a>
                    <a href={filmAssetUrl(movie.id, 'shotlist')} download>Shot list (.csv)</a>
                    <a href={filmAssetUrl(movie.id, 'subtitles')} download>Subtitles (.srt)</a>
                    <a href={filmUrl(movie.id)} download>Film (.mp4)</a>
                    {!pack.deliverables.poster && (
                      <button type="button" className="text-action" onClick={() => void makePoster()} disabled={posterBusy}>
                        {posterBusy ? <><Loader2 size={15} className="spin" /> Making key art…</> : <><Sparkles size={15} /> Make a poster (1 use)</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isActive(movie.status) && movie.status !== 'queued' && ordered.length > 0 && (
              <div className="director-advice">
                <h3>What the studio would fix</h3>
                <ul>
                  {ordered.map((item) => (
                    <li key={item.id} className={`advice advice-${item.severity}`}>
                      <div>
                        <p className="advice-title">{item.title}</p>
                        <p className="advice-message">{item.message}</p>
                      </div>
                      {item.kind === 're-shoot' && item.scene ? (
                        <button type="button" className="text-action" onClick={() => void fixScene(item.scene as number)} disabled={workingScene !== null}>
                          {workingScene === item.scene ? <><Loader2 size={15} className="spin" /> Re-shooting…</> : <><RefreshCw size={15} /> Re-shoot shot {item.scene}</>}
                        </button>
                      ) : item.kind === 'assemble' ? (
                        <button type="button" className="text-action" onClick={() => void recut()} disabled={busy}>
                          <Scissors size={15} /> Re-cut
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isActive(movie.status) && movie.status === 'done' && ordered.length === 0 && (
              <p className="director-clean">Nothing left to fix: every shot has motion, every line has a voice, and the cut is current.</p>
            )}

            {stage === 'film' && rendered.length > 1 && (
              <div className="director-others">
                <p className="field-label">OTHER FILMS</p>
                <ul>
                  {rendered.filter((entry) => entry.id !== movie.id).slice(0, 6).map((entry) => (
                    <li key={entry.id}>
                      <button type="button" className="library-row" onClick={() => void openFilm(entry)}>
                        <span className="library-title">{entry.title}</span>
                        <span className={`library-status status-${entry.status}`}>{entry.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default Director
