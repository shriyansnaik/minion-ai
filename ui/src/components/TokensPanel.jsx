import { useState, useEffect, useRef } from 'react'
import { fmtRelative, Icon } from '../lib'

function NewTokenForm({ onCreate, onCancel, creating }) {
  const [name, setName] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()) }}
      style={{ display: 'flex', gap: 8, marginBottom: 14, flexShrink: 0 }}
    >
      <input
        ref={ref} value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Token name, e.g. prod-server"
        style={{
          flex: 1, padding: '8px 12px',
          border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 13, outline: 'none', background: 'var(--bg)',
        }}
      />
      <button type="button" onClick={onCancel} style={{
        padding: '8px 16px', borderRadius: 50, background: 'transparent',
        color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer',
      }}>Cancel</button>
      <button type="submit" disabled={!name.trim() || creating} style={{
        padding: '8px 18px', borderRadius: 50,
        background: name.trim() && !creating ? '#5B53E8' : '#e0e0e0',
        color: name.trim() && !creating ? '#fff' : '#aaa',
        border: 'none', fontSize: 13, fontWeight: 600,
        cursor: name.trim() && !creating ? 'pointer' : 'not-allowed',
      }}>{creating ? '…' : 'Create'}</button>
    </form>
  )
}

function RevealedToken({ token, onDone }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(token) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{
      border: '1px solid #C7C2F4', background: '#F4F3FD', borderRadius: 10,
      padding: 14, marginBottom: 14, flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#5B53E8', marginBottom: 6 }}>
        Copy this token now — it will not be shown again.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1, fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace',
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          padding: '8px 10px', overflowX: 'auto', whiteSpace: 'nowrap', color: '#1d1d1f',
        }}>{token}</code>
        <button onClick={copy} style={{
          padding: '8px 14px', borderRadius: 7, background: '#5B53E8', color: '#fff',
          border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}>{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={onDone} style={{
          padding: '8px 12px', borderRadius: 7, background: 'transparent', color: 'var(--text-dim)',
          border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
        }}>Done</button>
      </div>
    </div>
  )
}

function TokenRow({ token, onRevoke }) {
  const [hovered, setHovered] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', padding: '10px 4px',
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'var(--bg)' : 'transparent', transition: 'background 0.1s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <div style={{ fontSize: 13, color: '#1d1d1f', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {token.name}
        </div>
        <code style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {token.prefix}…
        </code>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', width: 110, textAlign: 'right', flexShrink: 0 }}>
        {token.last_used_at ? `used ${fmtRelative(token.last_used_at)}` : 'never used'}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', width: 96, textAlign: 'right', flexShrink: 0 }}>
        {fmtRelative(token.created_at)}
      </div>
      <div style={{ width: 84, textAlign: 'right', flexShrink: 0 }}>
        {confirming ? (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button onClick={() => onRevoke(token.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
            <button onClick={() => setConfirming(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>No</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            style={{ background: 'none', border: 'none', color: hovered ? 'var(--red)' : 'transparent', fontSize: 12, cursor: 'pointer', transition: 'color 0.15s' }}
          >Revoke</button>
        )}
      </div>
    </div>
  )
}

export default function TokensPanel({ project }) {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/projects/${project.id}/tokens`)
      .then(r => r.json())
      .then(setTokens)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [project.id])

  async function handleCreate(name) {
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/tokens`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) { setError((await res.json()).detail || 'Failed to create token'); return }
      const t = await res.json()
      setRevealed(t.token)
      setTokens(prev => [{ ...t, token: undefined }, ...prev])
      setAdding(false)
    } catch { setError('Server unreachable') }
    finally { setCreating(false) }
  }

  async function handleRevoke(tokenId) {
    await fetch(`/api/projects/${project.id}/tokens/${tokenId}`, { method: 'DELETE' })
    setTokens(prev => prev.filter(t => t.id !== tokenId))
  }

  return (
    <>
      {revealed && <RevealedToken token={revealed} onDone={() => setRevealed(null)} />}

      {adding ? (
        <NewTokenForm onCreate={handleCreate} onCancel={() => { setAdding(false); setError(null) }} creating={creating} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
            Tokens let remote minion-ai instances push traces to this project.
          </div>
          <button onClick={() => setAdding(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 50, background: '#5B53E8', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}><Icon.plus size={14} /> Create token</button>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>loading…</div>
      ) : tokens.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>
          No tokens yet. Create one to enable remote tracing.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tokens.map(t => (
            <TokenRow key={t.id} token={t} onRevoke={handleRevoke} />
          ))}
        </div>
      )}
    </>
  )
}
