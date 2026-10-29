import { useState } from 'react'
import { ArrowRight, Download, Plus, Trash2 } from 'lucide-react'
import type { Project } from '../data'
import { downloadProject } from '../projectUtils'

type MyFilmsProps = {
  projects: Project[]
  onStart: () => void
  onOpen: (project: Project) => void
  onDelete: (id: string) => void
  notify: (message: string) => void
}

export function MyFilms({ projects, onStart, onOpen, onDelete, notify }: MyFilmsProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const exportProject = (project: Project) => {
    downloadProject(project)
    notify('Treatment downloaded as a text file.')
  }

  return (
    <section className="my-films section-dark" id="my-films">
      <div className="library-heading page-gutter">
        <div>
          <p className="eyebrow">MY FILMS / {projects.length.toString().padStart(2, '0')}</p>
          <h2>Your name<br /><em>in the credits.</em></h2>
        </div>
        <div className="library-note">
          <span>BROWSER-LOCAL LIBRARY</span>
          <p>Drafts stay on this device and won’t sync. Clearing browser data removes them.</p>
        </div>
      </div>

      <div className="project-list page-gutter">
        {projects.length === 0 ? (
          <div className="empty-library">
            <p>No drafts on the cutting-room floor.</p>
            <button type="button" className="text-action" onClick={onStart}>
              <Plus size={18} /> Create your first film <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          projects.map((project, index) => (
            <article className="project-row" key={project.id}>
              <span className="project-number">{(index + 1).toString().padStart(2, '0')}</span>
              <div className="project-title">
                <h3>{project.title}</h3>
                <p>{project.style} · {project.scenes.length} scenes · {project.duration}s</p>
              </div>
              <time dateTime={project.createdAt}>{new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
              {confirmId === project.id ? (
                <div className="delete-confirm" role="group" aria-label={`Confirm removal of ${project.title}`}>
                  <span>Remove draft?</span>
                  <button type="button" onClick={() => setConfirmId(null)}>Keep</button>
                  <button type="button" className="danger-action" onClick={() => { onDelete(project.id); setConfirmId(null) }}>Remove</button>
                </div>
              ) : (
                <div className="project-actions">
                  <button type="button" className="text-action" onClick={() => onOpen(project)}>Open <ArrowRight size={16} /></button>
                  <button type="button" className="icon-button" onClick={() => exportProject(project)} aria-label={`Export ${project.title}`}><Download size={17} /></button>
                  <button type="button" className="icon-button" onClick={() => setConfirmId(project.id)} aria-label={`Delete ${project.title}`}><Trash2 size={17} /></button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  )
}
