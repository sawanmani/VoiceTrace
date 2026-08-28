import { useRef, useState } from 'react'
import { analyzeFile } from '../lib/api'

export default function FileUpload({ onResults, disabled }) {
  const inputRef = useRef()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await analyzeFile(file)
      onResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="audio/*" onChange={handleFile}
        style={{ display: 'none' }} id="file-input" />
      <button
        id="btn-upload"
        className="btn btn-ghost"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {loading ? '⏳ Analyzing…' : '📁 Analyze Audio File'}
      </button>
      {error && (
        <div style={{ color: '#f87171', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  )
}
