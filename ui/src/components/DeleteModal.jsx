import { useState, useRef, useEffect } from 'react'
import { Icon } from '../lib'

// One confirmation flow for every trace deletion — single row (3-dot menu or
// drawer), and batch (selected rows, optionally all matching the filter). The
// "type delete to confirm" guard only appears for the high-blast-radius case
// of deleting every trace matching the current filter.
export default function DeleteModal({
  mode = 'single', id, selectedIds, filters, projectId, filterCount,
  onClose, onDeleted,
}) {
  const isBatch = mode === 'batch'
  const selectedCount = selectedIds ? selectedIds.size : 0
  const [deleteAllMatching, setDeleteAllMatching] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (deleteAllMatching) inputRef.current?.focus() }, [deleteAllMatching])

  // Close on Escape, like the drawer — modals should be dismissable by keyboard.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !deleting) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, deleting])

  const targetCount = isBatch ? (deleteAllMatching ? filterCount : selectedCount) : 1
  const needsType = isBatch && deleteAllMatching
  const confirmed = needsType ? confirmText === 'delete' : true
  const canOfferDeleteAll = isBatch && filterCount != null && filterCount > selectedCount

  async function handleDelete() {
    if (!confirmed || deleting) return
    setDeleting(true)
    try {
      if (!isBatch) {
        await fetch(`/api/traces/${id}`, { method: 'DELETE' })
        onDeleted([id])
      } else if (deleteAllMatching) {
        await fetch('/api/traces/bulk-delete-by-filter', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            status: filters.status || null,
            model: filters.model || null,
            search: filters.search || null,
            metadata_key: (filters.metadataPairs || []).map(p => p.key),
            metadata_value: (filters.metadataPairs || []).map(p => p.value),
            created_after: filters.createdAfter || null,
            created_before: filters.createdBefore || null,
          }),
        })
        onDeleted(null)
      } else {
        await fetch('/api/traces/bulk-delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...selectedIds] }),
        })
        onDeleted([...selectedIds])
      }
    } finally {
      setDeleting(false)
    }
  }

  const title = targetCount === 1
    ? 'Delete this trace?'
    : `Delete ${targetCount} traces?`

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,40,0.38)',
      backdropFilter: 'blur(1px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div onClick={e => e.stopPropagation()} className="fadein" style={{
        background: 'var(--bg-panel)', borderRadius: 16, padding: 22, width: 420,
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 10,
            background: 'var(--bg-error)', color: 'var(--red)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon.trash size={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              {targetCount === 1
                ? 'This permanently deletes the trace and all of its turns and tool calls. This cannot be undone.'
                : 'This permanently deletes every selected trace along with their turns and tool calls. This cannot be undone.'}
            </div>
          </div>
        </div>

        {canOfferDeleteAll && (
          <label style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            fontSize: 12.5, color: 'var(--text-dim)', cursor: 'pointer',
            marginTop: 16, padding: '10px 12px', borderRadius: 10,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <input
              type="checkbox" checked={deleteAllMatching}
              onChange={e => { setDeleteAllMatching(e.target.checked); setConfirmText('') }}
              style={{ marginTop: 1, cursor: 'pointer' }}
            />
            <span>Delete all <strong style={{ color: 'var(--text)' }}>{filterCount}</strong> traces matching the current filter, not just the {selectedCount} selected.</span>
          </label>
        )}

        {needsType && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
              Type <strong style={{ color: 'var(--text)' }}>delete</strong> to confirm
            </div>
            <input
              ref={inputRef} value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDelete() }}
              placeholder="delete"
              style={{
                width: '100%', padding: '9px 12px',
                border: `1px solid ${confirmed ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 9, fontSize: 13.5,
                color: confirmed ? 'var(--red)' : 'var(--text)', background: 'var(--bg)',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} disabled={deleting} style={{
            padding: '8px 16px', borderRadius: 9, background: 'transparent',
            color: 'var(--text-dim)', border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleDelete} disabled={!confirmed || deleting} style={{
            padding: '8px 18px', borderRadius: 9, border: 'none',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: confirmed ? 'var(--red)' : '#E6A9A4',
            color: '#fff', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
          }}>{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}
