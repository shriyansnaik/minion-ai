import { useState, useEffect } from 'react'
import { Icon, toUtcIso, fromUtcIso } from '../lib'

const inputStyle = {
  width: '100%', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 9,
  padding: '8px 10px', color: 'var(--text)',
  fontSize: 12.5, fontFamily: 'inherit',
}
const sectionLabel = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
  textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px',
}

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

function makeDraft(filters) {
  const after = fromUtcIso(filters.createdAfter)
  const before = fromUtcIso(filters.createdBefore)
  return {
    status: filters.status || '',
    model: filters.model || '',
    metadataPairs: (filters.metadataPairs || []).map(p => ({ ...p })),
    createdAfterDate: after.date, createdAfterTime: after.time,
    createdBeforeDate: before.date, createdBeforeTime: before.time,
  }
}

export default function FilterPanel({ filters, onApply, projectId, onClose }) {
  const [draft, setDraft] = useState(() => makeDraft(filters))
  const [models, setModels] = useState([])

  useEffect(() => {
    fetch(`/api/models?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => setModels([...(d.builtin || []).map(m => m.model_name), ...(d.custom || []).map(m => m.model_name)]))
      .catch(() => {})
  }, [projectId])

  function addMetaRow() {
    setDraft(d => ({ ...d, metadataPairs: [...d.metadataPairs, { key: '', value: '' }] }))
  }
  function updateMetaRow(i, field, val) {
    setDraft(d => ({ ...d, metadataPairs: d.metadataPairs.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }))
  }
  function removeMetaRow(i) {
    setDraft(d => ({ ...d, metadataPairs: d.metadataPairs.filter((_, idx) => idx !== i) }))
  }

  function apply() {
    const pairs = draft.metadataPairs.filter(p => p.key && p.value)
    onApply(f => ({
      ...f,
      status: draft.status,
      model: draft.model,
      metadataPairs: pairs,
      createdAfter: toUtcIso(draft.createdAfterDate, draft.createdAfterTime),
      createdBefore: toUtcIso(draft.createdBeforeDate, draft.createdBeforeTime, true),
    }))
  }

  function clear() {
    setDraft(makeDraft({}))
    onApply(f => ({ ...f, status: '', model: '', metadataPairs: [], createdAfter: '', createdBefore: '' }))
  }

  return (
    <div style={{
      width: 288, flexShrink: 0, height: '100%',
      borderRight: '1px solid var(--border)', background: 'var(--bg-panel)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '13px 12px 13px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <Icon.filter size={15} style={{ color: 'var(--text-dim)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Filters</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose} title="Close filters"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-item-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer',
          }}
        ><Icon.close size={16} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 4px' }}>
        <div style={{ marginBottom: 20 }}>
          <label style={sectionLabel}>Status</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STATUSES.map(s => {
              const active = draft.status === s.value
              return (
                <button key={s.value || 'all'} onClick={() => setDraft(d => ({ ...d, status: s.value }))} style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-dim)',
                  fontWeight: active ? 600 : 500, fontFamily: 'inherit', transition: 'all 0.12s',
                }}>{s.label}</button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={sectionLabel}>Model</label>
          <select value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} style={inputStyle}>
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={sectionLabel}>Metadata</label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, marginTop: -2 }}>
            Exact match — all pairs must match.
          </div>
          {draft.metadataPairs.map((pair, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className="search-input" placeholder="key" value={pair.key}
                onChange={e => updateMetaRow(i, 'key', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>=</span>
              <input
                className="search-input" placeholder="value" value={pair.value}
                onChange={e => updateMetaRow(i, 'value', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => removeMetaRow(i)} title="Remove"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
              >
                <Icon.plus size={14} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
          ))}
          <button onClick={addMetaRow} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-text)',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', fontWeight: 600,
          }}>
            <Icon.plus size={13} /> Add metadata filter
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={sectionLabel}>Created after</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="search-input" type="date" value={draft.createdAfterDate}
              onChange={e => setDraft(d => ({ ...d, createdAfterDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              className="search-input" type="time" value={draft.createdAfterTime}
              onChange={e => setDraft(d => ({ ...d, createdAfterTime: e.target.value }))}
              style={{ ...inputStyle, width: 92 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={sectionLabel}>Created before</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="search-input" type="date" value={draft.createdBeforeDate}
              onChange={e => setDraft(d => ({ ...d, createdBeforeDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              className="search-input" type="time" value={draft.createdBeforeTime}
              onChange={e => setDraft(d => ({ ...d, createdBeforeTime: e.target.value }))}
              style={{ ...inputStyle, width: 92 }}
            />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Leave time blank to include the whole day.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={clear} style={{
          flex: 1, padding: '9px 0', borderRadius: 9, background: 'transparent',
          color: 'var(--text-dim)', border: '1px solid var(--border)',
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Clear</button>
        <button onClick={apply} style={{
          flex: 1, padding: '9px 0', borderRadius: 9, background: 'var(--accent)',
          color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>Apply</button>
      </div>
    </div>
  )
}
