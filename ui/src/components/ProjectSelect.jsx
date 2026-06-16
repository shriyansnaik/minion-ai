import { useState, useEffect, useRef } from 'react'
import { fmtRelative, Icon } from '../lib'

const AVATAR_COLORS = [
  ['#5B53E8', '#8E6FE8'], ['#1D8348', '#39B8A6'], ['#E8923B', '#E85B7A'],
  ['#3B9AE8', '#5B53E8'], ['#C94FB0', '#8E6FE8'], ['#39B8A6', '#3B9AE8'],
]
function avatarFor(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function DeleteModal({ project, onConfirm, onCancel }) {
  const [value, setValue] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef(null)
  const confirmed = value === 'delete'

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    onConfirm(project.id)
  }

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,40,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} className="fadein" style={{
        background: '#fff', borderRadius: 18, padding: '32px 30px', width: 420,
        boxShadow: 'var(--shadow-lg)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Delete “{project.name}”?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 22 }}>
          This permanently deletes the project and all of its traces.<br />This cannot be undone.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textAlign: 'left' }}>
          Type <strong style={{ color: 'var(--text)' }}>delete</strong> to confirm
        </div>
        <input
          ref={inputRef} value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && confirmed && !deleting) handleDelete() }}
          placeholder="delete"
          style={{
            width: '100%', padding: '10px 14px',
            border: `1px solid ${confirmed ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 10, fontSize: 14, marginBottom: 22,
            color: confirmed ? 'var(--red)' : 'var(--text)',
          }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={handleDelete} disabled={!confirmed || deleting} style={{
            ...btnPrimary,
            background: confirmed ? 'var(--red)' : '#e0e0e0',
            color: confirmed ? '#fff' : '#aaa',
            cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
          }}>{deleting ? '…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ project, onSelect, onDeleteClick }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const [g1, g2] = avatarFor(project.name)

  useEffect(() => {
    if (!menuOpen) return
    function handle(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  return (
    <div
      onClick={() => onSelect(project)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', padding: 18, background: 'var(--bg-panel)',
        border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 11, marginBottom: 14,
        background: `linear-gradient(135deg, ${g1}, ${g2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 18, fontWeight: 700,
      }}>{project.name[0]?.toUpperCase() || '?'}</div>

      <div style={{
        fontSize: 14.5, fontWeight: 650, color: 'var(--text)', marginBottom: 4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 20,
      }}>{project.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {project.run_count === 0
          ? 'No runs yet'
          : `${project.run_count} run${project.run_count === 1 ? '' : 's'}${project.last_run_at ? ' · ' + fmtRelative(project.last_run_at) : ''}`}
      </div>

      {(hovered || menuOpen) && (
        <button onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }} style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 7,
          background: 'var(--bg)', border: '1px solid var(--border)',
          cursor: 'pointer', color: 'var(--text-dim)', zIndex: 10,
        }}><Icon.dots size={15} /></button>
      )}
      {menuOpen && (
        <div ref={menuRef} onClick={e => e.stopPropagation()} style={{
          position: 'absolute', top: 42, right: 12, background: '#fff',
          border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: 180, overflow: 'hidden',
        }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onDeleteClick() }}
            onMouseEnter={e => e.currentTarget.style.background = '#FFF0F0'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', textAlign: 'left', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}
          >Delete project & traces</button>
        </div>
      )}
    </div>
  )
}

function AddCard({ onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      padding: 18, borderRadius: 16, cursor: 'pointer',
      border: `1.5px dashed ${hovered ? 'var(--accent)' : 'var(--border-strong)'}`,
      background: hovered ? 'var(--accent-soft)' : 'transparent',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, minHeight: 132, color: hovered ? 'var(--accent-text)' : 'var(--text-muted)',
      transition: 'all 0.15s', fontFamily: 'inherit',
    }}>
      <Icon.plus size={22} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>New project</span>
    </button>
  )
}

export default function ProjectSelect({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { if (creating) inputRef.current?.focus() }, [creating])

  async function handleCreate(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) { setError((await res.json()).detail || 'Failed to create project'); return }
      onSelect(await res.json())
    } catch { setError('Server unreachable') }
    finally { setSubmitting(false) }
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', padding: '0 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <img src="/minions-logo.svg" alt="Minions" style={{ height: 26 }} onError={e => { e.currentTarget.outerHTML = '<span style="font-weight:700;font-size:16px;color:#1A1A1F">Minions</span>' }} />
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '44px 20px 60px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 6, letterSpacing: -0.3 }}>Projects</h1>
          <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Select a project to inspect its traces and analytics.</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {projects.map(p => (
              <ProjectCard key={p.id} project={p} onSelect={onSelect} onDeleteClick={() => setPendingDelete(p)} />
            ))}
            <AddCard onClick={() => setCreating(true)} />
          </div>
        )}
      </div>

      {creating && (
        <div onClick={() => { setCreating(false); setNewName(''); setError(null) }} style={{
          position: 'fixed', inset: 0, background: 'rgba(20,20,40,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleCreate} className="fadein" style={{
            background: '#fff', borderRadius: 18, padding: '30px 30px', width: 420, boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ fontSize: 17, color: 'var(--text)', marginBottom: 18, fontWeight: 700 }}>New project</div>
            <input
              ref={inputRef} value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. support-bot"
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 14, marginBottom: 16 }}
            />
            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setCreating(false); setNewName(''); setError(null) }} style={btnGhost}>Cancel</button>
              <button type="submit" disabled={submitting || !newName.trim()} style={{
                ...btnPrimary,
                opacity: submitting || !newName.trim() ? 0.55 : 1,
                cursor: submitting || !newName.trim() ? 'not-allowed' : 'pointer',
              }}>{submitting ? '…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <DeleteModal project={pendingDelete} onConfirm={id => { setProjects(ps => ps.filter(p => p.id !== id)); setPendingDelete(null) }} onCancel={() => setPendingDelete(null)} />
      )}

    </div>
  )
}

const btnGhost = {
  padding: '10px 22px', borderRadius: 50, background: 'transparent',
  color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
}
const btnPrimary = {
  padding: '10px 22px', borderRadius: 50, background: 'var(--accent)',
  color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
