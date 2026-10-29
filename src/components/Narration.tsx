import { useState } from 'react'
import { Quote } from 'lucide-react'
import { generateContent } from '../lib/studioClient'

type NarrationProps = {
  title: string
  shot: string
  value: string
  onChange: (text: string) => void
}

export function Narration({ title, shot, value, onChange }: NarrationProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const draft = async () => {
    setError('')
    setBusy(true)
    try {
      const text = await generateContent(`${title}. This scene: ${shot}`, 'shorts')
      onChange(text.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Narration could not be drafted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="narration">
      <div className="narration-head">
        <label htmlFor="scene-narration">VOICE-OVER</label>
        <button type="button" className="text-action" onClick={draft} disabled={busy}>
          <Quote size={15} />
          {busy ? 'Writing…' : value ? 'Rewrite with AI' : 'Draft with AI'}
        </button>
      </div>
      <textarea
        id="scene-narration"
        rows={3}
        value={value}
        placeholder="One or two lines of spoken narration for this scene."
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
