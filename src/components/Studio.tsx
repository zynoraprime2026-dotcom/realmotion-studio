import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Download, Film, Pause, Play, Save } from 'lucide-react'
import { createScenes, type Project, type Scene, type StudioSeed } from '../data'
import { downloadProject } from '../projectUtils'
import { KeyArt } from './KeyArt'
import { Animate } from './Animate'
import { Narration } from './Narration'

const examplePrompt = 'A cartographer discovers a map that redraws itself every night, leading her toward a city that was erased from history. Atmospheric mystery, vast desert landscapes, warm lantern light.'

const styles = ['Science fiction', 'Neo-noir', 'Fantasy', 'Dance drama', 'Adventure']
const ratios = ['16:9', '9:16', '1:1']

type StudioProps = {
  seed: StudioSeed | null
  onSave: (project: Project) => void
  notify: (message: string) => void
}

export function Studio({ seed, onSave, notify }: StudioProps) {
  const [title, setTitle] = useState(seed?.title ?? 'The Memory Cartographer')
  const [prompt, setPrompt] = useState(seed?.prompt ?? examplePrompt)
  const [style, setStyle] = useState(seed?.style && styles.includes(seed.style) ? seed.style : 'Science fiction')
  const [ratio, setRatio] = useState(seed?.ratio ?? '16:9')
  const [duration, setDuration] = useState(seed?.duration ?? 12)
  const [scenes, setScenes] = useState<Scene[]>(() => seed?.scenes ?? createScenes(seed?.prompt ?? examplePrompt, seed?.style ?? 'Science fiction', seed?.duration ?? 12))
  const [activeScene, setActiveScene] = useState(0)
  const [building, setBuilding] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!playing || scenes.length < 2) return
    const timer = window.setInterval(() => {
      setActiveScene((current) => (current + 1) % scenes.length)
    }, 2400)
    return () => window.clearInterval(timer)
  }, [playing, scenes.length])

  const currentScene = scenes[activeScene] ?? scenes[0]
  const project = useMemo<Project>(() => ({
    id: crypto.randomUUID(),
    title: title.trim(),
    prompt: prompt.trim(),
    style,
    ratio,
    duration,
    createdAt: new Date().toISOString(),
    scenes,
  }), [title, prompt, style, ratio, duration, scenes])

  const buildStoryboard = () => {
    if (title.trim().length < 2) {
      setError('Give your film a title before building the shot plan.')
      return
    }
    if (prompt.trim().length < 24) {
      setError('Add a little more story detail — at least 24 characters works best.')
      return
    }
    setError('')
    setPlaying(false)
    setBuilding(true)
    setSaved(false)
    window.setTimeout(() => {
      setScenes(createScenes(prompt, style, duration))
      setActiveScene(0)
      setBuilding(false)
    }, 650)
  }

  const updateScene = (id: number, shot: string) => {
    setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, shot } : scene))
    setSaved(false)
  }

  const patchScene = (id: number, patch: Partial<Scene>) => {
    setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, ...patch } : scene))
    setSaved(false)
  }

  const saveDraft = () => {
    if (!currentScene) {
      setError('Build a shot plan before saving your film.')
      return
    }
    onSave(project)
    setSaved(true)
    notify('Film draft saved to My films in this browser.')
  }

  const exportDraft = () => {
    downloadProject(project)
    notify('Treatment downloaded as a text file.')
  }

  return (
    <section className="studio section-light" id="studio">
      <div className="section-heading page-gutter">
        <div>
          <p className="eyebrow dark-ink">THE DIRECTOR’S DESK</p>
          <h2>Start with a feeling.<br /><em>Leave with a film plan.</em></h2>
        </div>
        <p className="section-summary dark-ink">Write the spark, choose the visual language, and shape every beat. Storyboard briefs and treatments are generated in this browser. Key art and single-scene motion come from the studio API. For a whole film with voice-over, music and a cut, use Director Mode below.</p>
      </div>

      <div className="studio-workspace page-gutter">
        <div className="studio-form-panel">
          <div className="field-group">
            <label htmlFor="film-title">FILM TITLE</label>
            <input id="film-title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false) }} maxLength={70} />
          </div>
          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="film-prompt">YOUR STORY SPARK</label>
              <span>{prompt.length}/600</span>
            </div>
            <textarea id="film-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value.slice(0, 600)); setSaved(false) }} rows={6} placeholder="A character, a place, a change…" />
          </div>
          <div className="field-group">
            <label htmlFor="film-style">VISUAL LANGUAGE</label>
            <select id="film-style" value={style} onChange={(event) => { setStyle(event.target.value); setSaved(false) }}>
              {styles.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <fieldset className="field-group ratio-field">
            <legend>FRAME</legend>
            <div className="ratio-options">
              {ratios.map((item) => (
                <button key={item} type="button" className={ratio === item ? 'selected' : ''} onClick={() => { setRatio(item); setSaved(false) }} aria-pressed={ratio === item}>
                  <span className={`ratio-icon ratio-${item.replace(':', '-')}`} aria-hidden="true" />
                  {item}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field-group duration-field">
            <div className="field-label-row">
              <label htmlFor="film-duration">TARGET DURATION</label>
              <output htmlFor="film-duration">{duration} SEC</output>
            </div>
            <input id="film-duration" className="duration-range" type="range" min="6" max="30" step="3" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setSaved(false) }} />
            <div className="range-labels"><span>6s</span><span>30s</span></div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="button button-dark build-button" onClick={buildStoryboard} disabled={building}>
            {building ? 'Composing shots…' : 'Build shot plan'}
            {!building && <ArrowRight size={18} aria-hidden="true" />}
          </button>
          <p className="local-note">LOCAL STORYBOARD PLANNER · YOUR TEXT STAYS IN THIS BROWSER</p>
        </div>

        <div className="storyboard-panel" aria-live="polite">
          <KeyArt
            prompt={prompt}
            style={style}
            ratio={ratio}
            onArt={(url) => {
              const target = currentScene?.id
              if (target === undefined) return
              setScenes((current) => current.map((scene) => (scene.id === target ? { ...scene, image: url } : scene)))
              setSaved(false)
            }}
            notify={notify}
          />
          <div className="storyboard-topline">
            <span>STORYBOARD / {scenes.length.toString().padStart(2, '0')} SCENES</span>
            <span>{style.toUpperCase()} · {ratio}</span>
          </div>
          {building ? (
            <div className={`storyboard-loading frame-${ratio.replace(':', '-')}`}>
              <div className="loading-line" />
              <p>Finding the opening frame…</p>
            </div>
          ) : currentScene ? (
            <>
              <div className={`storyboard-screen frame-${ratio.replace(':', '-')}`}>
                {currentScene.video ? (
                  <video
                    key={currentScene.video}
                    src={currentScene.video}
                    poster={currentScene.image}
                    controls
                    playsInline
                    loop
                    muted
                  />
                ) : (
                  <img key={currentScene.id} src={currentScene.image} alt={`Visual direction for scene ${currentScene.id}`} />
                )}
                <div className="frame-corners" aria-hidden="true" />
                <span className="preview-badge">STORYBOARD PREVIEW · NOT RENDERED FOOTAGE</span>
                <button type="button" className="board-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause storyboard preview' : 'Play storyboard preview'}>
                  {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                </button>
              </div>
              <div className="scene-tabs" role="tablist" aria-label="Storyboard scenes">
                {scenes.map((scene, index) => (
                  <button key={scene.id} type="button" role="tab" aria-selected={activeScene === index} className={activeScene === index ? 'active' : ''} onClick={() => { setActiveScene(index); setPlaying(false) }}>
                    <span>0{scene.id}</span>
                    <span>{scene.title}</span>
                    <span>{scene.duration}s</span>
                  </button>
                ))}
              </div>
              <div className="scene-editor">
                <label htmlFor={`scene-${currentScene.id}`}>SCENE 0{currentScene.id} / SHOT DIRECTION</label>
                <textarea id={`scene-${currentScene.id}`} rows={3} value={currentScene.shot} onChange={(event) => updateScene(currentScene.id, event.target.value)} />
              </div>
              <div className="scene-tools">
                <Animate
                  imageUrl={currentScene.image}
                  prompt={currentScene.shot}
                  onVideo={(url) => patchScene(currentScene.id, { video: url })}
                  notify={notify}
                />
                <Narration
                  title={title}
                  shot={currentScene.shot}
                  value={currentScene.narration ?? ''}
                  onChange={(text) => patchScene(currentScene.id, { narration: text })}
                />
              </div>
              <div className="storyboard-actions">
                <button type="button" className="text-action" onClick={exportDraft}><Download size={17} /> Export treatment</button>
                <button type="button" className="button button-acid save-button" onClick={saveDraft}>
                  {saved ? <Check size={17} /> : <Save size={17} />}
                  {saved ? 'Saved locally' : 'Save to My films'}
                </button>
              </div>
            </>
          ) : (
            <div className="storyboard-empty">
              <Film size={30} strokeWidth={1.3} />
              <p>Your first frame is waiting.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
