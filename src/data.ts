export type Film = {
  id: string
  title: string
  category: string
  year: string
  duration: string
  image: string
  logline: string
  synopsis: string
  prompt: string
}

export type Scene = {
  id: number
  title: string
  shot: string
  duration: number
  image: string
}

export type Project = {
  id: string
  title: string
  prompt: string
  style: string
  ratio: string
  duration: number
  createdAt: string
  scenes: Scene[]
}

export type StudioSeed = {
  title: string
  prompt: string
  style: string
  scenes?: Scene[]
  ratio?: string
  duration?: number
}

export const films: Film[] = [
  {
    id: 'last-signal',
    title: 'The Last Signal',
    category: 'Science fiction',
    year: '2026',
    duration: '02:14',
    image: '/images/last-signal.webp',
    logline: 'The last astronaut on Earth answers a call that left the planet centuries ago.',
    synopsis: 'On a volcanic shoreline beneath a broken moon, a solitary astronaut discovers a signal coming from a vessel that should never have returned. A story about distance, memory, and the voices we keep waiting for.',
    prompt: 'A lone astronaut on a black volcanic shoreline receives a signal from a colossal damaged spacecraft. Cold moonlight, a single red flare, intimate science fiction, slow anamorphic camera moves.',
  },
  {
    id: 'neon-requiem',
    title: 'Neon Requiem',
    category: 'Neo-noir',
    year: '2026',
    duration: '01:48',
    image: '/images/neon-requiem.webp',
    logline: 'One missing woman. One rainy night. A city that remembers everything.',
    synopsis: 'A detective follows a final voicemail through the electric backstreets of a city that never dries. Every reflection offers a different version of the truth, and every witness is protecting someone.',
    prompt: 'A female detective searches for a missing singer during one rain-soaked night in a neon city. Transparent umbrella, black coat, coral and acid-yellow reflections, elegant neo-noir cinematography.',
  },
  {
    id: 'wilder',
    title: 'Wilder',
    category: 'Fantasy',
    year: '2026',
    duration: '03:06',
    image: '/images/wilder.webp',
    logline: 'To find the way home, he must first learn what the forest remembers.',
    synopsis: 'A young explorer carrying his mother’s brass lantern enters an ancient forest where light has a language of its own. A gentle epic about courage, grief, and the wild places that help us grow.',
    prompt: 'A young explorer with a brass lantern enters an ancient moonlit forest filled with tiny luminous creatures. Magical realism, emerald shadows, warm golden light, intimate epic fantasy.',
  },
  {
    id: 'between-us',
    title: 'Between Us',
    category: 'Dance drama',
    year: '2026',
    duration: '01:32',
    image: '/images/between-us.webp',
    logline: 'Two bodies. One unfinished conversation. No words left to hide behind.',
    synopsis: 'Inside a silent concrete gallery, two dancers replay the final moments of a relationship through movement. Vermilion fabric connects and divides them in a study of gravity, longing, and release.',
    prompt: 'Two contemporary dancers suspended inside a brutalist concrete gallery, connected by a sweeping vermilion ribbon. Hard sunlight, floating dust, expressive movement, minimal prestige dance drama.',
  },
]

export const styleImages: Record<string, string> = {
  'Science fiction': '/images/last-signal.webp',
  'Neo-noir': '/images/neon-requiem.webp',
  Fantasy: '/images/wilder.webp',
  'Dance drama': '/images/between-us.webp',
  Adventure: '/images/hero-portal.jpg',
}

export function createScenes(prompt: string, style: string, totalDuration: number): Scene[] {
  const image = styleImages[style] ?? styleImages['Science fiction']
  const cleanPrompt = prompt.trim().replace(/[.\s]+$/, '')
  const segment = Math.max(2, Math.round(totalDuration / 3))
  return [
    {
      id: 1,
      title: 'The world opens',
      shot: `Wide establishing shot. Introduce the central image from this story: ${cleanPrompt}. Let the environment move before the character does.`,
      duration: segment,
      image,
    },
    {
      id: 2,
      title: 'The turn',
      shot: `Push slowly into a medium close-up as the discovery becomes personal. Hold on the reaction, then let one striking detail break the stillness.`,
      duration: segment,
      image,
    },
    {
      id: 3,
      title: 'The afterimage',
      shot: `Track toward the horizon as the character makes an irreversible choice. End on a bold final composition with room for the emotional note to linger.`,
      duration: Math.max(2, totalDuration - segment * 2),
      image,
    },
  ]
}
