import { useState, useEffect, useRef } from 'react'
import { Icon, toUtcIso, fromUtcIso } from '../lib'

const inputStyle = {
  width: '100%', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 9,
  padding: '7px 9px', color: 'var(--text)',
  fontSize: 12.5, fontFamily: 'inherit',
}
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', margin: '10px 0 4px' }

function emptyDraft() {
  return {
    model: '', metadataPairs: [],
    createdAfterDate: '', createdAfterTime: '', createdBeforeDate: '', createdBeforeTime: '',
  }
}

export default function FilterPopover({ filters, onApply, projectId }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft())
  const [models, setModels] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const after = fromUtcIso(filters.createdAfter)
    const before = fromUtcIso(filters.createdBefore)
    setDraft({
      model: filters.model,
      metadataPairs: (filters.metadataPairs || []).map(p => ({ ...p })),
      createdAfterDate: after.date, createdAfterTime: after.time,
      createdBeforeDate: before.date, createdBeforeTime: before.time,
    })
    fetch(`/api/models?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => setModels([...(d.builtin || []).map(m => m.model_name), ...(d.custom || []).map(m => m.model_name)]))
      .catch(() => {})
  }, [open, filters, projectId])

  useEffect(() => {
    if (!open) return
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const activeCount = (filters.model ? 1 : 0) + (filters.metadataPairs || []).length
    + (filters.createdAfter ? 1 : 0) + (filters.createdBefore ? 1 : 0)

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
      model: draft.model,
      metadataPairs: pairs,
      createdAfter: toUtcIso(draft.createdAfterDate, draft.createdAfterTime),
      createdBefore: toUtcIso(draft.createdBeforeDate, draft.createdBeforeTime, true),
    }))
    setOpen(false)
  }

  function clear() {
    setDraft(emptyDraft())
    onApply(f => ({ ...f, model: '', metadataPairs: [], createdAfter: '', createdBefore: '' }))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11.5, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
        border: `1px solid ${activeCount > 0 ? 'transparent' : 'var(--border)'}`,
        background: activeCount > 0 ? 'var(--accent)' : 'transparent',
        color: activeCount > 0 ? '#fff' : 'var(--text-dim)',
        fontWeight: activeCount > 0 ? 600 : 500,
      }}>
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        <Icon.chevron size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s' }} />
      </button>

      {open && (
        <div className="fadein" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          width: 280, background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-md)', padding: 14,
        }}>
          <label style={labelStyle}>Model</label>
          <select value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} style={inputStyle}>
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <label style={labelStyle}>Metadata (exact match, all must match)</label>
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
                <Icon.plus size={13} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
          ))}
          <button onClick={addMetaRow} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--accent-text)',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit',
          }}>
            <Icon.plus size={12} /> Add metadata filter
          </button>

          <label style={labelStyle}>From</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="search-input" type="date" value={draft.createdAfterDate}
              onChange={e => setDraft(d => ({ ...d, createdAfterDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              className="search-input" type="time" value={draft.createdAfterTime}
              onChange={e => setDraft(d => ({ ...d, createdAfterTime: e.target.value }))}
              style={{ ...inputStyle, width: 88 }}
            />
          </div>

          <label style={labelStyle}>To</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="search-input" type="date" value={draft.createdBeforeDate}
              onChange={e => setDraft(d => ({ ...d, createdBeforeDate: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              className="search-input" type="time" value={draft.createdBeforeTime}
              onChange={e => setDraft(d => ({ ...d, createdBeforeTime: e.target.value }))}
              style={{ ...inputStyle, width: 88 }}
            />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Leave time blank to include the whole day.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={clear} style={{
              padding: '6px 14px', borderRadius: 7, background: 'transparent',
              color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear</button>
            <button onClick={apply} style={{
              padding: '6px 14px', borderRadius: 7, background: 'var(--accent)',
              color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
