import type { Project } from './data'

export function buildBrief(project: Project): string {
  const sceneList = project.scenes
    .map((scene) => `SCENE ${scene.id} — ${scene.title.toUpperCase()} (${scene.duration}s)\n${scene.shot}`)
    .join('\n\n')
  return [
    'TASVEER STUDIO — FILM TREATMENT',
    '===========================',
    project.title.toUpperCase(),
    '',
    `Style: ${project.style}`,
    `Frame: ${project.ratio}`,
    `Duration: ${project.duration} seconds`,
    `Saved: ${new Date(project.createdAt).toLocaleDateString()}`,
    '',
    'STORY SEED',
    project.prompt,
    '',
    'SHOT PLAN',
    sceneList,
    '',
    '—',
    'This is a storyboard brief, not a rendered video.',
  ].join('\n')
}

export function treatmentFileName(project: Project): string {
  const slug = project.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'tasveer-film'}-treatment.txt`
}

export function downloadProject(project: Project) {
  const blob = new Blob([buildBrief(project)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = treatmentFileName(project)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
