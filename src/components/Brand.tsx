type BrandProps = {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <span className="brand" aria-label="RealMotion home">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2.5 20.1 12 29.5 16 20.1 20 16 29.5 11.9 20 2.5 16 11.9 12Z" fill="currentColor" />
        <circle cx="16" cy="16" r="3.25" fill="var(--ink)" />
      </svg>
      {!compact && <span>REALMOTION<sup>®</sup></span>}
    </span>
  )
}
