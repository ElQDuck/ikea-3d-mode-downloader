interface Props {
  jobId: string
  filename: string
}

export default function ModelViewer({ jobId, filename }: Props) {
  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 4,
        overflow: 'hidden',
        background: '#f0f0f0',
        border: '1px solid #e0e0e0',
      }}
    >
      <model-viewer
        src={`/api/preview/${jobId}`}
        alt={`3D preview of ${filename}`}
        camera-controls
        auto-rotate
        shadow-intensity="1"
        loading="eager"
        style={{ width: '100%', height: '360px', display: 'block' }}
      />
    </div>
  )
}
