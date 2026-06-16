import { useState, useRef, useEffect } from 'react'

export default function AddModelModal({ project, initialModelName = '', onSave, onClose }) {
  const [modelName, setModelName] = useState(initialModelName)
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const firstRef = useRef(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  const canSave = modelName.trim() && inputPrice !== '' && outputPrice !== '' && !saving

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/models/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          model_name: modelName.trim(),
          input_price_per_mtok: parseFloat(inputPrice),
          output_price_per_mtok: parseFloat(outputPrice),
        }),
      })
      if (!res.ok) {
        setError((await res.json()).detail || 'Failed to save')
        return
      }
      onSave(await res.json())
    } catch {
      setError('Server unreachable')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSave}
        style={{
          background: '#fff', borderRadius: 18,
          padding: '36px 32px', width: 440,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1d1d1f', marginBottom: 4 }}>
          Add model pricing
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
          Prices in USD per 1 million tokens
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 5 }}>Model name</label>
          <input
            ref={initialModelName ? null : firstRef}
            value={modelName}
            onChange={e => setModelName(e.target.value)}
            placeholder="e.g. openai/gpt-5"
            style={{
              width: '100%', padding: '9px 12px',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 5 }}>Input $/1M tokens</label>
            <input
              ref={initialModelName ? firstRef : null}
              type="number" step="any" min="0"
              value={inputPrice}
              onChange={e => setInputPrice(e.target.value)}
              placeholder="e.g. 2.50"
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 14, outline: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginBottom: 5 }}>Output $/1M tokens</label>
            <input
              type="number" step="any" min="0"
              value={outputPrice}
              onChange={e => setOutputPrice(e.target.value)}
              placeholder="e.g. 10.00"
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 14, outline: 'none',
              }}
            />
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 24px', borderRadius: 50,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            type="submit"
            disabled={!canSave}
            style={{
              padding: '10px 24px', borderRadius: 50,
              background: canSave ? '#5B53E8' : '#e0e0e0',
              color: canSave ? '#fff' : '#aaa',
              border: 'none', fontSize: 14, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >{saving ? '…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
