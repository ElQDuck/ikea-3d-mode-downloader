import { useState, useCallback } from 'react'
import UrlForm from './components/UrlForm'
import StatusPanel from './components/StatusPanel'

export interface Job {
  id: string
  status: string
  message: string
  filename?: string
  error?: string
}

export default function App() {
  const [job, setJob] = useState<Job | null>(null)

  const handleSubmit = useCallback(async (url: string) => {
    setJob(null)
    try {
      const res = await fetch('/api/fetch-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as { jobId?: string; error?: string }
      if (!res.ok) {
        setJob({ id: '', status: 'error', message: '', error: data.error ?? `HTTP ${res.status}` })
        return
      }
      setJob({ id: data.jobId!, status: 'pending', message: 'Job created' })
    } catch (err) {
      setJob({ id: '', status: 'error', message: '', error: String(err) })
    }
  }, [])

  const handleReset = useCallback(() => setJob(null), [])

  return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 8 }}>
        IKEA 3D Model Downloader
      </h1>
      <p style={{ color: '#555', marginBottom: 32 }}>
        Paste an IKEA product URL to download its 3D model (GLB file).
      </p>
      <UrlForm
        onSubmit={handleSubmit}
        disabled={job !== null && job.status !== 'done' && job.status !== 'error'}
      />
      {job !== null && (
        <StatusPanel job={job} onJobUpdate={setJob} onReset={handleReset} />
      )}
    </div>
  )
}
