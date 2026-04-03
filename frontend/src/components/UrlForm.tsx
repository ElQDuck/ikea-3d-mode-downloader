import { useState, FormEvent } from 'react'

interface Props {
  onSubmit: (url: string) => void
  disabled: boolean
}

export default function UrlForm({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const validate = (v: string): string | null => {
    if (!v.trim()) return 'Please enter a URL.'
    try {
      const u = new URL(v.trim())
      if (!['http:', 'https:'].includes(u.protocol)) return 'URL must use http or https.'
    } catch {
      return 'Please enter a valid URL.'
    }
    return null
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const err = validate(value)
    if (err) { setError(err); return }
    setError(null)
    onSubmit(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          placeholder="https://www.ikea.com/…"
          disabled={disabled}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '1rem',
            border: `1px solid ${error ? '#c0392b' : '#ccc'}`,
            borderRadius: 4,
            outline: 'none',
          }}
          aria-label="IKEA product URL"
          aria-invalid={!!error}
          aria-describedby={error ? 'url-error' : undefined}
        />
        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            fontWeight: 600,
            background: disabled ? '#aaa' : '#0058a3',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Download
        </button>
      </div>
      {error && (
        <p id="url-error" role="alert" style={{ color: '#c0392b', marginTop: 6, fontSize: '0.875rem' }}>
          {error}
        </p>
      )}
    </form>
  )
}
