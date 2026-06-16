import { useState, useEffect } from 'react'
import AddModelModal from './AddModelModal'
import TokensPanel from './TokensPanel'

function fmt_price(p) {
  if (p == null) return '—'
  return `$${Number(p).toFixed(2)}`
}

function ModelRow({ model, custom, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '9px 4px',
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'var(--bg)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <div style={{
          fontSize: 13, color: '#1d1d1f', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {model.model_name}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', width: 90, textAlign: 'right', flexShrink: 0 }}>
        {fmt_price(model.input_price_per_mtok)}<span style={{ color: 'var(--text-muted)', fontSize: 10 }}>/M in</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', width: 96, textAlign: 'right', flexShrink: 0 }}>
        {fmt_price(model.output_price_per_mtok)}<span style={{ color: 'var(--text-muted)', fontSize: 10 }}>/M out</span>
      </div>
      <div style={{ width: 64, textAlign: 'right', flexShrink: 0 }}>
        {custom ? (
          <button
            onClick={() => onDelete(model.model_name)}
            style={{
              background: 'none', border: 'none',
              color: hovered ? 'var(--red)' : 'transparent',
              fontSize: 12, cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >Delete</button>
        ) : (
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: '#EEEDFB', color: '#5B53E8', fontWeight: 600,
          }}>built-in</span>
        )}
      </div>
    </div>
  )
}

function ModelsPanel({ project }) {
  const [models, setModels] = useState({ builtin: [], custom: [] })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/models?project_id=${encodeURIComponent(project.id)}`)
      .then(r => r.json())
      .then(setModels)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [project.id])

  const q = search.toLowerCase()
  const filteredCustom = models.custom.filter(m => m.model_name.toLowerCase().includes(q))
  const filteredBuiltin = models.builtin.filter(m => m.model_name.toLowerCase().includes(q))

  async function handleDelete(modelName) {
    await fetch(`/api/models/custom?model_name=${encodeURIComponent(modelName)}&project_id=${encodeURIComponent(project.id)}`, { method: 'DELETE' })
    setModels(prev => ({ ...prev, custom: prev.custom.filter(m => m.model_name !== modelName) }))
  }

  function handleAdded(model) {
    setModels(prev => ({
      ...prev,
      custom: [model, ...prev.custom.filter(m => m.model_name !== model.model_name)],
    }))
    setAddOpen(false)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models…"
          style={{
            flex: 1, padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 13, outline: 'none', background: 'var(--bg)',
          }}
        />
        <button
          onClick={() => setAddOpen(true)}
          style={{
            padding: '8px 18px', borderRadius: 50,
            background: '#5B53E8', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >Add model</button>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10, flexShrink: 0 }}>
        Custom model prices are specific to this project.
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredCustom.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2, marginTop: 4 }}>Custom</div>
              {filteredCustom.map(m => (
                <ModelRow key={m.model_name} model={m} custom onDelete={handleDelete} />
              ))}
              <div style={{ height: 16 }} />
            </>
          )}

          {filteredBuiltin.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Built-in ({filteredBuiltin.length})</div>
              {filteredBuiltin.map(m => (
                <ModelRow key={m.model_name} model={m} />
              ))}
            </>
          )}

          {filteredCustom.length === 0 && filteredBuiltin.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>
              No models match "{search}"
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <AddModelModal project={project} onSave={handleAdded} onClose={() => setAddOpen(false)} />
      )}
    </>
  )
}

const NAV = [
  { id: 'tokens', label: 'API Tokens' },
  { id: 'models', label: 'Models' },
]

export default function SettingsModal({ project, onClose }) {
  const [section, setSection] = useState('tokens')

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 900 }}
      />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 901, pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: 18,
            width: 720, height: '76vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            pointerEvents: 'all',
          }}
        >
          {/* header */}
          <div style={{
            padding: '18px 24px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1d1f' }}>Settings</div>
              {project && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{project.name}</div>}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-dim)', cursor: 'pointer', lineHeight: 1 }}
            >✕</button>
          </div>

          {/* body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* sidebar */}
            <div style={{ width: 148, borderRight: '1px solid var(--border)', padding: '12px 8px', flexShrink: 0 }}>
              {NAV.map(item => {
                const active = section === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 8, marginBottom: 2,
                      background: active ? '#EEEDFB' : 'transparent',
                      color: active ? '#5B53E8' : 'var(--text-dim)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </div>
                )
              })}
            </div>

            {/* content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px' }}>
              {project ? (
                section === 'tokens' ? <TokensPanel project={project} /> : <ModelsPanel project={project} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>Open a project to manage its settings.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
