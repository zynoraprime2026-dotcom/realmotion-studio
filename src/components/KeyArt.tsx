import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { generateKeyArt } from '../lib/studioClient'

type KeyArtProps = {
  prompt: string
  style: string
  ratio: string
  onArt: (url: string) => void
  notify: (message: string) => void
}

const SIZES: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1536, height: 864 },
  '9:16': { width: 864, height: 1536 },
  '1:1': { width: 1024, height: 1024 },
}

export function KeyArt({ prompt, style, ratio, onArt, notify }: KeyArtProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = prompt.trim().length >= 24

  const run = async () => {
    if (!ready) {
      setError('Write at least 24 characters of story before generating art.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const { width, height } = SIZES[ratio] ?? SIZES['16:9']
      const composed = `${style} film still. ${prompt.trim()}`.slice(0, 1200)
      const url = await generateKeyArt(composed, width, height)
      onArt(url)
      notify('Key art added to this scene.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Key art could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="key-art">
      <button type="button" className="button button-ghost" onClick={run} disabled={busy || !ready}>
        <Sparkles size={16} aria-hidden="true" />
        {busy ? 'Painting key art…' : 'Generate key art'}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
