import { useEffect } from 'react'
import type { Job } from '../App'

interface Props {
  job: Job
  onJobUpdate: (j: Job) => void
  onReset: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued',
  navigating: 'Loading IKEA product page…',
  waiting_for_3d: 'Activating 3D viewer…',
  downloading: 'Intercepting model file…',
  done: 'Model ready!',
  error: 'Failed',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f0ad4e',
  navigating: '#0058a3',
  waiting_for_3d: '#0058a3',
  downloading: '#0058a3',
  done: '#27ae60',
  error: '#c0392b',
}

export default function StatusPanel({ job, onJobUpdate, onReset }: Props) {
  const isDone = job.status === 'done'
  const isError = job.status === 'error'
  const isActive = !isDone && !isError

  useEffect(() => {
    if (!isActive || !job.id) return

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${job.id}`)
        const updated = await res.json() as Job
        onJobUpdate({ ...updated, id: job.id })
      } catch {}
    }, 1500)

    return () => clearInterval(timer)
  }, [job.id, job.status, isActive, onJobUpdate])

  const color = STATUS_COLORS[job.status] ?? '#888'
  const label = STATUS_LABELS[job.status] ?? job.status.toUpperCase()

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 24,
        padding: '16px 20px',
        borderLeft: `4px solid ${color}`,
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isActive && <Spinner color={color} />}
        <span style={{ fontWeight: 600, color }}>{label}</span>
      </div>
      {job.message && (
        <p style={{ marginTop: 8, color: '#333', fontSize: '0.925rem' }}>{job.message}</p>
      )}

      {isDone && (
        <a
          href={`/api/download/${job.id}`}
          download={job.filename}
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '9px 18px',
            background: '#0058a3',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          Download {job.filename ?? 'model.glb'}
        </a>
      )}

      {isError && (
        <p style={{ marginTop: 8, color: '#c0392b', fontSize: '0.925rem' }}>
          {job.error ?? 'Unknown error'}
        </p>
      )}

      {(isDone || isError) && (
        <button
          onClick={onReset}
          style={{
            display: 'block',
            marginTop: 12,
            background: 'none',
            border: 'none',
            color: '#0058a3',
            cursor: 'pointer',
            padding: 0,
            fontSize: '0.875rem',
            textDecoration: 'underline',
          }}
        >
          Start over
        </button>
      )}
    </div>
  )
}

function Spinner({ color }: { color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
