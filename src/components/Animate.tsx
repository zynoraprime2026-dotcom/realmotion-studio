import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { animateScene, videoStatus } from '../lib/studioClient'

type AnimateProps = {
  imageUrl: string
  prompt: string
  onVideo: (url: string) => void
  notify: (message: string) => void
}

const CLIP_SECONDS = 5
const POLL_MS = 6000
const MAX_POLLS = 40

export function Animate({ imageUrl, prompt, onVideo, notify }: AnimateProps) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const cancelled = useRef(false)

  useEffect(() => () => { cancelled.current = true }, [])

  const run = async () => {
    setError('')
    setBusy(true)
    setProgress(10)
    try {
      const jobId = await animateScene(imageUrl, prompt, CLIP_SECONDS)
      for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_MS))
        if (cancelled.current) return
        const job = await videoStatus(jobId)
        setProgress(job.progress || Math.min(95, 20 + attempt * 2))
        if (job.status === 'done' && job.videoUrl) {
          onVideo(job.videoUrl)
          notify(`Added a ${CLIP_SECONDS}s clip to this scene.`)
          return
        }
        if (job.status === 'failed') throw new Error(job.error || 'The studio could not finish this animation.')
      }
      throw new Error('This clip is taking longer than expected. Check back in a minute.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Animation failed.')
    } finally {
      if (!cancelled.current) setBusy(false)
    }
  }

  return (
    <div className="animate-row">
      <button type="button" className="button button-ghost" onClick={run} disabled={busy || !imageUrl}>
        <Clapperboard size={16} aria-hidden="true" />
        {busy ? `Animating ${progress}%…` : `Animate ${CLIP_SECONDS}s clip`}
      </button>
      <p className="animate-note">
        Real motion via Replicate. A {CLIP_SECONDS}s clip is the cheapest useful length, roughly $0.25.
      </p>
      {busy && (
        <div className="animate-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(5, progress)}%` }} />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="text-action" onClick={run} disabled={busy}>Try again</button>
        </p>
      )}
    </div>
  )
}
