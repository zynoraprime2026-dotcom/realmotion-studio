import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { films, type Film } from '../data'

const filters = ['All', 'Science fiction', 'Neo-noir', 'Fantasy', 'Dance drama']

type ExploreProps = {
  onSelect: (film: Film) => void
}

export function Explore({ onSelect }: ExploreProps) {
  const [filter, setFilter] = useState('All')
  const visibleFilms = filter === 'All' ? films : films.filter((film) => film.category === filter)

  return (
    <section className="explore section-dark" id="explore">
      <div className="explore-heading page-gutter">
        <div>
          <p className="eyebrow">THE CONCEPT COLLECTION / VOL. 01</p>
          <h2>A world can start<br /><em>anywhere.</em></h2>
        </div>
        <p>Four original sample treatments. Open one, borrow its spark, and take the story somewhere only you would.</p>
      </div>
      <div className="film-filters page-gutter" role="group" aria-label="Filter films by genre">
        {filters.map((item) => (
          <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} aria-pressed={filter === item}>
            {item}
            <span>{item === 'All' ? films.length : films.filter((film) => film.category === item).length}</span>
          </button>
        ))}
      </div>
      <div className={`film-grid page-gutter ${visibleFilms.length === 1 ? 'single-film' : ''}`}>
        {visibleFilms.map((film, index) => (
          <button type="button" className="film-card" key={film.id} onClick={() => onSelect(film)} aria-label={`Open treatment for ${film.title}`}>
            <div className="film-image-wrap">
              <img src={film.image} alt="" loading={index > 1 ? 'lazy' : 'eager'} />
              <span className="film-index">0{films.findIndex((item) => item.id === film.id) + 1}</span>
              <span className="film-open"><ArrowUpRight size={25} strokeWidth={1.4} /></span>
            </div>
            <div className="film-card-copy">
              <div>
                <h3>{film.title}</h3>
                <p>{film.logline}</p>
              </div>
              <div className="film-card-meta">
                <span>{film.category}</span>
                <span>{film.duration}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
