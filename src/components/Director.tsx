import { useCallback, useEffect, useRef, useState } from 'react'
import { Aperture, Check, Clapperboard, Crop, Film, Loader2, Music, Plus, RefreshCw, Scissors, Sparkles, Sun, Users, Wand2, X } from 'lucide-react'
import {
  ACTIVE_MOVIE_STATUSES,
  assembleMovie,
  createMovieFromDraft,
  createSeries,
  cutTrailer,
  cutVertical,
  getUsage,
  listSeries,
  suggestSeries,
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
  type FilmQuality,
  type FilmSeries,
  type SeriesSuggestion,
  type StudioUsage,
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

/** A state a person can read at a glance, rather than the API's enum. */
function stateWord(status: string): string {
  if (status === 'done') return 'ready'
  if (status === 'partial') return 'shots failed'
  if (status === 'failed') return 'stopped'
  if (status === 'queued') return 'waiting to start'
  return status
}

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
  const [quality, setQuality] = useState<FilmQuality>(() => {
    const saved = localStorage.getItem('studio.quality')
    return saved === 'storyboard' || saved === 'high' ? saved : 'standard'
  })
  const [cutBusy, setCutBusy] = useState<'vertical' | 'trailer' | null>(null)
  const [usage, setUsage] = useState<StudioUsage | null>(null)
  const [series, setSeries] = useState<FilmSeries[]>([])
  const [seriesId, setSeriesId] = useState(() => localStorage.getItem('studio.series') ?? '')
  const [bibleOpen, setBibleOpen] = useState(false)
  const [bibleName, setBibleName] = useState('')
  const [bibleText, setBibleText] = useState('')
  const [bibleBusy, setBibleBusy] = useState(false)
  const [bibleIdeas, setBibleIdeas] = useState<SeriesSuggestion[]>([])
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [openIdeas, setOpenIdeas] = useState<string[]>([])
  const [justAdded, setJustAdded] = useState<{ label: string; before: string } | null>(null)
  const bibleRef = useRef<HTMLTextAreaElement | null>(null)

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

  const makeCut = async (kind: 'vertical' | 'trailer') => {
    if (!movie) return
    setCutBusy(kind)
    try {
      if (kind === 'vertical') await cutVertical(movie.id)
      else await cutTrailer(movie.id)
      setPack(await getFilmPackage(movie.id))
      notify(kind === 'vertical' ? 'Vertical cut ready to download.' : 'Trailer ready to download.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That cut could not be made.')
    } finally {
      setCutBusy(null)
    }
  }

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
      const next = await draftMovie({ prompt: prompt.trim(), aspectRatio: ratio, scenes: shotCount, seriesId: seriesId || undefined })
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

  useEffect(() => {
    void getUsage().then(setUsage).catch(() => setUsage(null))
    void listSeries().then(setSeries).catch(() => setSeries([]))
  }, [])

  // what this render will actually cost, straight from the studio's own numbers
  const costs = usage?.movie_costs ?? { storyboard: 4, standard: 20, high: 30 }
  const renderCost = costs[quality]
  const shortOnUses = usage !== null && usage.remaining < renderCost

  const askForSuggestions = async () => {
    setSuggestBusy(true)
    setError('')
    try {
      const list = await suggestSeries(bibleName.trim(), bibleText.trim())
      setBibleIdeas(list)
      if (!list.length) setError('The studio had nothing to add. Your bible may already cover it.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestions could not be fetched.')
    } finally {
      setSuggestBusy(false)
    }
  }

  // A tap has to leave a trace: the line lands, the field scrolls to it, and
  // the change is undoable. Otherwise the card just vanishes and the user is
  // left wondering whether anything happened.
  const acceptSuggestion = (suggestion: SeriesSuggestion) => {
    const before = bibleText
    setBibleText((current) => (current.trim() ? `${current.trim()}\n\n${suggestion.text}` : suggestion.text))
    setBibleIdeas((current) => current.filter((entry) => entry.text !== suggestion.text))
    setJustAdded({ label: suggestion.label || 'line', before })
    requestAnimationFrame(() => {
      const field = bibleRef.current
      if (field) field.scrollTop = field.scrollHeight
    })
  }

  const undoAdd = () => {
    if (!justAdded) return
    setBibleText(justAdded.before)
    setJustAdded(null)
  }

  const skipIdea = (suggestion: SeriesSuggestion) => {
    setBibleIdeas((current) => current.filter((entry) => entry.text !== suggestion.text))
  }

  const toggleIdea = (text: string) => {
    setOpenIdeas((current) => (current.includes(text) ? current.filter((entry) => entry !== text) : [...current, text]))
  }

  /** The icon that tells the eye what a suggestion is about before reading it. */
  const ideaIcon = (label: string) => {
    const word = label.toLowerCase()
    if (/cast|charact|people|face/.test(word)) return Users
    if (/light|palette|colou?r|look|tone/.test(word)) return Sun
    if (/camera|lens|frame|shot|movement/.test(word)) return Aperture
    if (/sound|music|voice|score|silence/.test(word)) return Music
    return Sparkles
  }

  useEffect(() => {
    if (!justAdded) return
    const timer = window.setTimeout(() => setJustAdded(null), 8000)
    return () => window.clearTimeout(timer)
  }, [justAdded])

  const saveBible = async () => {
    if (bibleName.trim().length < 2) {
      setError('Give the series a name.')
      return
    }
    setBibleBusy(true)
    setError('')
    try {
      const created = await createSeries(bibleName.trim(), bibleText.trim())
      setSeries((current) => [created, ...current])
      setSeriesId(created.id)
      localStorage.setItem('studio.series', created.id)
      setBibleName('')
      setBibleText('')
      setBibleOpen(false)
      notify(`"${created.name}" saved. Every film in it keeps the same look and cast.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That series could not be saved.')
    } finally {
      setBibleBusy(false)
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
      localStorage.setItem('studio.quality', quality)
      const created = await createMovieFromDraft(
        draft.draft_id,
        shots.map((shot) => ({ visualPrompt: shot.visualPrompt, narrationText: shot.narrationText, duration: shot.duration })),
        title.trim() || draft.title,
        quality,
        seriesId || undefined,
      )
      void getUsage().then(setUsage).catch(() => undefined)
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
              <p className="director-note">
                DRAFT COSTS {usage?.draft_cost ?? 1} {usage?.draft_cost === 1 ? 'USE' : 'USES'} · NOTHING RENDERS UNTIL YOU APPROVE THE SHOTS
              </p>
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
                      <span className={`library-status status-${entry.status}`}>{stateWord(entry.status)}{isActive(entry.status) ? ` ${entry.progress ?? 0}%` : ''}</span>
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
            <div className="allowance">
              {usage ? (
                <>
                  <p className={`allowance-line${shortOnUses ? ' is-short' : ''}`}>
                    {usage.remaining} of {usage.limit} uses left this month · {quality} render costs {renderCost}
                  </p>
                  {shortOnUses && (
                    <p className="allowance-hint">
                      Not enough left for this tier. {costs.storyboard <= usage.remaining
                        ? `Storyboard costs ${costs.storyboard} and still produces a real film, just with held stills instead of moving shots.`
                        : 'Top the monthly limit up in the Render dashboard, then reload this page.'}
                    </p>
                  )}
                </>
              ) : (
                <p className="allowance-line">Allowance unknown right now. The studio will tell you at render time.</p>
              )}
            </div>
            <div className="director-actions">
              <div className="quality-row" role="radiogroup" aria-label="Render quality">
                {([
                  { key: 'storyboard', label: 'Storyboard', note: 'stills only · cheapest' },
                  { key: 'standard', label: 'Standard', note: '5s shots' },
                  { key: 'high', label: 'High', note: '10s shots · costs most' },
                ] as { key: FilmQuality; label: string; note: string }[]).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={quality === opt.key}
                    className={`quality-option${quality === opt.key ? ' is-on' : ''}`}
                    onClick={() => setQuality(opt.key)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.note}</span>
                  </button>
                ))}
              </div>
              <div className="series-block">
                <label className="field-label" htmlFor="director-series">SERIES (OPTIONAL)</label>
                <select
                  id="director-series"
                  className="series-select"
                  value={seriesId}
                  onChange={(event) => {
                    setSeriesId(event.target.value)
                    localStorage.setItem('studio.series', event.target.value)
                  }}
                >
                  <option value="">A one-off film</option>
                  {series.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
                <button type="button" className="text-action" onClick={() => setBibleOpen((open) => !open)}>
                  {bibleOpen ? 'Cancel' : 'Write a series bible'}
                </button>
                {bibleOpen && (
                  <div className="series-form">
                    <input className="series-input" placeholder="Series name" value={bibleName} onChange={(event) => setBibleName(event.target.value)} aria-label="Series name" />
                    <textarea ref={bibleRef} className="series-input series-bible" rows={3} placeholder="The look, the cast, the rules those films must obey" value={bibleText} onChange={(event) => setBibleText(event.target.value)} aria-label="Series bible" />
                    <button type="button" className="text-action" onClick={() => void askForSuggestions()} disabled={suggestBusy} aria-live="polite">
                      {suggestBusy ? 'Reading your bible…' : bibleIdeas.length ? 'Suggest something else' : 'AI suggestions · free'}
                    </button>
                    <p className="suggestion-free">Free. Ask again as often as you like.</p>
                    {bibleIdeas.length > 0 && (
                      <ul className="suggestion-list">
                        {bibleIdeas.map((suggestion) => {
                          const Icon = ideaIcon(suggestion.label)
                          const open = openIdeas.includes(suggestion.text)
                          return (
                            <li key={suggestion.text} className="suggestion-item">
                              <div className="suggestion-card">
                                <div className="suggestion-head">
                                  <span className="suggestion-label">
                                    <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
                                    {suggestion.label || 'Suggestion'}
                                  </span>
                                  <button
                                    type="button"
                                    className="suggestion-dismiss"
                                    onClick={() => skipIdea(suggestion)}
                                    aria-label={`Skip the ${suggestion.label || 'suggested'} line`}
                                  >
                                    <X size={14} strokeWidth={1.8} aria-hidden="true" />
                                  </button>
                                </div>
                                <p className={open ? 'suggestion-text is-open' : 'suggestion-text'}>{suggestion.text}</p>
                                <div className="suggestion-foot">
                                  {suggestion.text.length > 120 && (
                                    <button type="button" className="suggestion-more" onClick={() => toggleIdea(suggestion.text)} aria-expanded={open}>
                                      {open ? 'Show less' : 'Show all'}
                                    </button>
                                  )}
                                  <button type="button" className="suggestion-add" onClick={() => acceptSuggestion(suggestion)}>
                                    <Plus size={14} strokeWidth={2} aria-hidden="true" />
                                    Add to bible
                                  </button>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {justAdded && (
                      <p className="suggestion-added" role="status">
                        <Check size={14} strokeWidth={2} aria-hidden="true" />
                        Added the {justAdded.label.toLowerCase()} line
                        <button type="button" className="suggestion-undo" onClick={undoAdd}>Undo</button>
                      </p>
                    )}
                    <button type="button" className="chip" onClick={() => void saveBible()} disabled={bibleBusy}>
                      {bibleBusy ? 'Saving…' : 'Save series'}
                    </button>
                  </div>
                )}
              </div>
              <p className="director-note">RENDER: STILLS → CHAINED SHOTS → VOICE → MUSIC → SUBTITLES → CUT</p>
              <button type="button" className="director-button" onClick={renderFilm} disabled={busy || shortOnUses}>
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
                      ? 'cut and ready to watch'
                      : movie.status === 'partial'
                        ? 'some shots failed. Open it to see which, then re-shoot those.'
                        : movie.status === 'failed'
                          ? 'this render stopped. Open it to see why before spending again.'
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
                    {pack.deliverables.vertical ? (
                      <a href={filmAssetUrl(movie.id, 'vertical')} download>Vertical 9:16 (.mp4)</a>
                    ) : (
                      <button type="button" className="text-action" onClick={() => void makeCut('vertical')} disabled={cutBusy !== null}>
                        {cutBusy === 'vertical' ? <><Loader2 size={15} className="spin" /> Cropping to 9:16…</> : <><Crop size={15} /> Cut a 9:16 version (1 use)</>}
                      </button>
                    )}
                    {pack.deliverables.trailer ? (
                      <a href={filmAssetUrl(movie.id, 'trailer')} download>Trailer (.mp4)</a>
                    ) : (
                      <button type="button" className="text-action" onClick={() => void makeCut('trailer')} disabled={cutBusy !== null}>
                        {cutBusy === 'trailer' ? <><Loader2 size={15} className="spin" /> Cutting the trailer…</> : <><Film size={15} /> Cut a trailer (1 use)</>}
                      </button>
                    )}
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
                        <span className={`library-status status-${entry.status}`}>{stateWord(entry.status)}</span>
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
