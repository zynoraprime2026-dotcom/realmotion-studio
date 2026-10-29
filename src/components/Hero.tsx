import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, Maximize2, Pause, Play } from 'lucide-react'

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '00:00'
  const seconds = Math.floor(value)
  return `00:${seconds.toString().padStart(2, '0')}`
}

type HeroProps = {
  onStart: () => void
}

export function Hero({ onStart }: HeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(8)
  const [videoAvailable, setVideoAvailable] = useState(true)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      videoRef.current?.pause()
    }
  }, [])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video || !videoAvailable) return
    if (video.paused) {
      await video.play()
    } else {
      video.pause()
    }
  }

  const scrub = (value: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = value
    setTime(value)
  }

  const enterFullscreen = async () => {
    if (heroRef.current?.requestFullscreen) {
      await heroRef.current.requestFullscreen()
    }
  }

  return (
    <section className="hero" id="home" ref={heroRef} aria-label="RealMotion introduction">
      <div className="hero-media" aria-hidden="true">
        <img src="/images/hero-portal.jpg" alt="" className="hero-poster" />
        {videoAvailable && (
          <video
            ref={videoRef}
            className="hero-video"
            src="/images/hero-motion.mp4"
            poster="/images/hero-portal.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 8)}
            onError={() => setVideoAvailable(false)}
          />
        )}
      </div>
      <div className="hero-shade" aria-hidden="true" />

      <div className="hero-content page-gutter">
        <div className="hero-kicker">
          <span>AI MOVIE STUDIO</span>
          <span>STORY → SHOTS → SCREEN</span>
        </div>
        <h1>
          One line.
          <em>Infinite cinema.</em>
        </h1>
        <div className="hero-intro">
          <p>Shape the story, direct the look, and turn your idea into a shot-by-shot film plan.</p>
          <button className="button button-acid" type="button" onClick={onStart}>
            Enter the studio
            <ArrowDown size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="hero-controls page-gutter">
        <div className="hero-control-buttons">
          <button type="button" className="icon-button" onClick={togglePlayback} disabled={!videoAvailable} aria-label={playing ? 'Pause showreel' : 'Play showreel'}>
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <span className="control-label">{videoAvailable ? 'PORTAL / MOTION STUDY' : 'PORTAL / STILL PREVIEW'}</span>
        </div>
        <div className="scrubber">
          <span>{formatTime(time)}</span>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={Math.min(time, duration)}
            onChange={(event) => scrub(Number(event.target.value))}
            aria-label="Showreel playback position"
            disabled={!videoAvailable}
            style={{ '--scrub-progress': `${(time / duration) * 100}%` } as CSSProperties}
          />
          <span>{formatTime(duration)}</span>
        </div>
        <button type="button" className="icon-button fullscreen-button" onClick={enterFullscreen} aria-label="View showreel fullscreen">
          <Maximize2 size={18} />
        </button>
      </div>
    </section>
  )
}
