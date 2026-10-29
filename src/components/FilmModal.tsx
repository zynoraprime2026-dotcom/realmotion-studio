import { useEffect, useRef } from 'react'
import { ArrowRight, Clock, X } from 'lucide-react'
import type { Film } from '../data'

type FilmModalProps = {
  film: Film
  onClose: () => void
  onUse: (film: Film) => void
}

export function FilmModal({ film, onClose, onUse }: FilmModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div className="film-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="film-modal" role="dialog" aria-modal="true" aria-labelledby="film-modal-title">
        <button ref={closeRef} type="button" className="modal-close icon-button" onClick={onClose} aria-label="Close film treatment">
          <X size={21} />
        </button>
        <div className="modal-image">
          <img src={film.image} alt={`Key art for ${film.title}`} />
          <span>CONCEPT KEY ART</span>
        </div>
        <div className="modal-copy">
          <p className="eyebrow">{film.category} / {film.year}</p>
          <h2 id="film-modal-title">{film.title}</h2>
          <p className="modal-logline">{film.logline}</p>
          <p className="modal-synopsis">{film.synopsis}</p>
          <div className="modal-meta">
            <span><Clock size={15} /> {film.duration}</span>
            <span>3 ACT STRUCTURE</span>
            <span>2.39:1</span>
          </div>
          <div className="modal-prompt">
            <span>THE ORIGINAL SPARK</span>
            <p>{film.prompt}</p>
          </div>
          <button type="button" className="button button-acid" onClick={() => onUse(film)}>
            Use as creative seed
            <ArrowRight size={18} />
          </button>
          <p className="modal-footnote">This opens an editable storyboard in the studio. It does not copy or render a video.</p>
        </div>
      </section>
    </div>
  )
}
