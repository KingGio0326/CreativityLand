'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md px-6">
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 8px',
            fontSize: 22,
            fontWeight: 700,
            color: '#ef4444',
          }}
        >
          !
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          An unexpected error occurred. Try again or go back to the dashboard.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={reset} className="btn-primary">
            Retry
          </button>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid rgba(139,92,246,0.3)',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
