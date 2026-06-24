import { useState, useRef, useEffect } from 'react'

export default function BatchDeleteModal({ selectedIds, filters, projectId, filterCount, onClose, onDeleted }) {
  const [deleteAllMatching, setDeleteAllMatching] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (deleteAllMatching) inputRef.current?.focus() }, [deleteAllMatching])

  const selectedCount = selectedIds.size
  const targetCount = deleteAllMatching ? filterCount : selectedCount
  const confirmed = deleteAllMatching ? confirmText === 'delete' : true
  const canOfferDeleteAll = filterCount != null && filterCount > selectedCount

  async function handleDelete() {
    setDeleting(true)
    try {
      if (deleteAllMatching) {
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
      } else {
        await fetch('/api/traces/bulk-delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...selectedIds] }),
        })
      }
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,40,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} className="fadein" style={{
        background: '#fff', borderRadius: 18, padding: '32px 30px', width: 440,
        boxShadow: 'var(--shadow-lg)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Delete {targetCount} trace{targetCount === 1 ? '' : 's'}?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 18 }}>
          This permanently deletes the trace{targetCount === 1 ? '' : 's'} and all turns/tool calls within.<br />This cannot be undone.
        </div>

        {canOfferDeleteAll && (
          <label style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left',
            fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 18, cursor: 'pointer',
          }}>
            <input
              type="checkbox" checked={deleteAllMatching}
              onChange={e => { setDeleteAllMatching(e.target.checked); setConfirmText('') }}
              style={{ marginTop: 2 }}
            />
            <span>Delete all <strong style={{ color: 'var(--text)' }}>{filterCount}</strong> traces matching the current filter, not just the {selectedCount} selected</span>
          </label>
        )}

        {deleteAllMatching && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textAlign: 'left' }}>
              Type <strong style={{ color: 'var(--text)' }}>delete</strong> to confirm
            </div>
            <input
              ref={inputRef} value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && confirmed && !deleting) handleDelete() }}
              placeholder="delete"
              style={{
                width: '100%', padding: '10px 14px',
                border: `1px solid ${confirmed ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 10, fontSize: 14, marginBottom: 22,
                color: confirmed ? 'var(--red)' : 'var(--text)',
              }}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: deleteAllMatching ? 0 : 8 }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleDelete} disabled={!confirmed || deleting} style={{
            ...btnPrimary,
            background: deleteAllMatching ? (confirmed ? 'var(--red)' : '#e0e0e0') : 'var(--red)',
            color: deleteAllMatching && !confirmed ? '#aaa' : '#fff',
            cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
          }}>{deleting ? '…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}

const btnGhost = {
  padding: '10px 22px', borderRadius: 50, background: 'transparent',
  color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
}
const btnPrimary = {
  padding: '10px 22px', borderRadius: 50, border: 'none',
  fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
}
