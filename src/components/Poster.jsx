import { useState } from 'react'

export default function Poster({ src, title, className = '' }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-line-light text-ink-tertiary ${className}`}>
        <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden="true">
          <path
            fill="currentColor"
            d="M28 8h6v34.2a9 9 0 1 1-4-7.4V14h14v-6H28V8Zm-2 36a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
          />
        </svg>
        <span className="sr-only">{title} 포스터 없음</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  )
}
