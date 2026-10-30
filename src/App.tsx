import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Menu, X } from 'lucide-react'
import { Brand } from './components/Brand'
import { Hero } from './components/Hero'
import { Studio } from './components/Studio'
import type { Film, Project, StudioSeed } from './data'

// Below-the-fold sections and the modal load on demand, so the first paint only
// carries the hero and the studio instead of the whole collection.
const Explore = lazy(() => import('./components/Explore').then((m) => ({ default: m.Explore })))
const MyFilms = lazy(() => import('./components/MyFilms').then((m) => ({ default: m.MyFilms })))
const FilmModal = lazy(() => import('./components/FilmModal').then((m) => ({ default: m.FilmModal })))
const Director = lazy(() => import('./components/Director').then((m) => ({ default: m.Director })))

function SectionFallback({ label }: { label: string }) {
  return (
    <div className="page-gutter" style={{ padding: '96px 0' }} role="status" aria-live="polite">
      <span className="local-status"><i /> Loading {label}…</span>
    </div>
  )
}

const STORAGE_KEY = 'tasveer-projects-v1'
// Projects saved before the rename live under the old key; read through to them
// once so a returning visitor's library does not vanish.
const LEGACY_STORAGE_KEY = 'realmotion-projects-v1'

function loadProjects(): Project[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as Project[] : []
  } catch {
    return []
  }
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [selectedFilm, setSelectedFilm] = useState<Film | null>(null)
  const [studioSeed, setStudioSeed] = useState<StudioSeed | null>(null)
  const [studioSession, setStudioSession] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [toast, setToast] = useState('')
  const [filmCount, setFilmCount] = useState<number | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  }, [projects])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileOpen])

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3600)
  }, [])

  const scrollToStudio = useCallback(() => {
    setMobileOpen(false)
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const saveProject = (project: Project) => {
    setProjects((current) => [project, ...current])
  }

  const useFilm = (film: Film) => {
    setStudioSeed({ title: `${film.title}: Reimagined`, prompt: film.prompt, style: film.category })
    setStudioSession((current) => current + 1)
    setSelectedFilm(null)
    window.setTimeout(scrollToStudio, 60)
  }

  const openProject = (project: Project) => {
    setStudioSeed({
      title: project.title,
      prompt: project.prompt,
      style: project.style,
      scenes: project.scenes,
      ratio: project.ratio,
      duration: project.duration,
    })
    setStudioSession((current) => current + 1)
    scrollToStudio()
  }

  const deleteProject = (id: string) => {
    setProjects((current) => current.filter((project) => project.id !== id))
    notify('Draft removed from this browser.')
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="app-shell">
      <a className="skip-link" href="#studio">Skip to studio</a>
      <header className={`site-header ${scrolled || mobileOpen ? 'header-solid' : ''}`}>
        <a href="#home" className="brand-link" onClick={closeMobile}><Brand /></a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#studio">Create</a>
          <a href="#explore">Collection</a>
          <a href="#films">Films <span>{filmCount === null ? '—' : filmCount.toString().padStart(2, '0')}</span></a>
          <a href="#my-films">Drafts <span>{projects.length.toString().padStart(2, '0')}</span></a>
        </nav>
        <div className="header-actions">
          <span className="local-status"><i /> FILM STUDIO ONLINE</span>
          <button type="button" className="header-cta" onClick={scrollToStudio}>Start a film <span>↗</span></button>
          <button type="button" className="mobile-menu-button icon-button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-controls="mobile-navigation" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">
          <a href="#studio" onClick={closeMobile}>Create <span>01</span></a>
          <a href="#explore" onClick={closeMobile}>Collection <span>02</span></a>
          <a href="#films" onClick={closeMobile}>Films <span>{filmCount === null ? '—' : filmCount.toString().padStart(2, '0')}</span></a>
          <a href="#my-films" onClick={closeMobile}>Drafts <span>{projects.length.toString().padStart(2, '0')}</span></a>
          <p>Ideas in. Cinema out.</p>
        </nav>
      )}

      <main>
        <Hero onStart={scrollToStudio} />
        <Studio key={studioSession} seed={studioSeed} onSave={saveProject} notify={notify} />
        <Suspense fallback={<SectionFallback label="director" />}>
          <Director notify={notify} onFilms={setFilmCount} />
        </Suspense>
        <Suspense fallback={<SectionFallback label="collection" />}>
          <Explore onSelect={setSelectedFilm} />
        </Suspense>
        <Suspense fallback={<SectionFallback label="your films" />}>
          <MyFilms projects={projects} onStart={scrollToStudio} onOpen={openProject} onDelete={deleteProject} notify={notify} />
        </Suspense>
      </main>

      <footer className="site-footer page-gutter">
        <Brand />
        <p>Your story deserves more than a still frame.</p>
        <button type="button" className="text-action" onClick={() => document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })}>Back to top <ArrowUp size={17} /></button>
        <span>© 2026 TASVEER STUDIO</span>
      </footer>

      {selectedFilm && (
        <Suspense fallback={null}>
          <FilmModal film={selectedFilm} onClose={() => setSelectedFilm(null)} onUse={useFilm} />
        </Suspense>
      )}
      <div className={`toast ${toast ? 'toast-visible' : ''}`} role="status" aria-live="polite">
        <Check size={17} /> {toast}
      </div>
    </div>
  )
}
