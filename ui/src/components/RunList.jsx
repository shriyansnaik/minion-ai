import { useState, useEffect, useRef } from 'react'
import { statusColor, fmtCost, fmtMs, fmtRelative, fmtCompact, shortModel, Icon } from '../lib'
import FilterPopover from './FilterPopover'
import BatchDeleteModal from './BatchDeleteModal'

function RunRow({ run, selected, onSelect, onDelete, checked, onToggleCheck }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const color = statusColor(run.status)
  const preview = (run.input || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const tokens = (run.total_input_tokens || 0) + (run.total_output_tokens || 0)

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  async function handleDelete(e) {
    e.stopPropagation()
    setMenuOpen(false)
    await fetch(`/api/traces/${run.id}`, { method: 'DELETE' })
    onDelete(run.id)
  }

  const showDots = hovered || menuOpen
  const showCheckbox = hovered || checked || menuOpen
  const meta = [
    shortModel(run.model),
    fmtRelative(run.created_at),
    tokens ? `${fmtCompact(tokens)} tok` : null,
    run.estimated_cost != null ? fmtCost(run.estimated_cost) : null,
    run.total_latency_ms ? fmtMs(run.total_latency_ms) : null,
  ].filter(Boolean)

  return (
    <div
      onClick={() => onSelect(run.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '11px 16px 12px',
        borderLeft: `2.5px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        background: selected ? 'var(--bg-item-sel)' : hovered ? 'var(--bg-item-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <span style={{ width: 14, flexShrink: 0, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {showCheckbox ? (
            <input
              type="checkbox" checked={checked}
              onClick={e => e.stopPropagation()}
              onChange={e => onToggleCheck(run.id, e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          ) : (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }}
              className={run.status === 'running' ? 'live-dot' : ''} />
          )}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginRight: 14,
          }}>
            {preview || <span style={{ color: 'var(--text-muted)' }}>(empty input)</span>}
          </div>
          <div className="tnum" style={{
            marginTop: 5, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: 7, fontSize: 11.5, color: 'var(--text-muted)',
          }}>
            {meta.map((m, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {i > 0 && <span style={{ color: 'var(--border-strong)' }}>·</span>}
                {m}
              </span>
            ))}
          </div>
          {(run.tags || []).length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {run.tags.map(t => (
                <span key={t} style={{
                  fontSize: 10.5, padding: '1px 7px', borderRadius: 5,
                  background: 'var(--accent-soft)', color: 'var(--accent-text)', fontWeight: 500,
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDots && (
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
          style={{
            position: 'absolute', top: 8, right: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text-dim)', zIndex: 10,
          }}
        ><Icon.dots size={15} /></button>
      )}

      {menuOpen && (
        <div ref={menuRef} onClick={e => e.stopPropagation()} style={{
          position: 'absolute', top: 36, right: 8,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100,
          minWidth: 130, overflow: 'hidden',
        }}>
          <button
            onClick={handleDelete}
            onMouseEnter={e => e.currentTarget.style.background = '#FFF0F0'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            style={{
              display: 'block', width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none', textAlign: 'left',
              color: 'var(--red)', fontSize: 12.5, cursor: 'pointer',
            }}
          >Delete trace</button>
        </div>
      )}
    </div>
  )
}

function pageWindow(current, max, span = 2) {
  const start = Math.max(1, current - span)
  const end = Math.min(max, current + span)
  const pages = []
  for (let p = start; p <= end; p++) pages.push(p)
  return pages
}

const pageBtnStyle = active => ({
  minWidth: 24, height: 24, padding: '0 5px', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#fff' : 'var(--text-dim)',
  fontSize: 11.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
})

export default function RunList({
  runs, loading, filters, onFilter, selectedId, onSelect, onDelete,
  projectId, pageSize, currentPage, furthestKnownPage, hasNextPage, totalCount,
  onPageChange, onBulkDeleted,
}) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
  const statuses = ['', 'running', 'completed', 'failed']
  const labels = { '': 'All', running: 'Running', completed: 'Completed', failed: 'Failed' }

  // The current page's selection only makes sense for the page/filter it was
  // made on — not across the 3s poll, which keeps currentPage/filters stable.
  useEffect(() => { setSelectedIds(new Set()) }, [currentPage, filters])

  function handleSearch(e) {
    if (e.key === 'Enter') onFilter(f => ({ ...f, search: searchInput }))
  }

  function toggleSort() {
    onFilter(f => ({ ...f, sort: f.sort === 'asc' ? 'desc' : 'asc' }))
  }

  function toggleCheck(id, isChecked) {
    setSelectedIds(s => {
      const next = new Set(s)
      if (isChecked) next.add(id); else next.delete(id)
      return next
    })
  }

  function toggleSelectAllOnPage(e) {
    setSelectedIds(e.target.checked ? new Set(runs.map(r => r.id)) : new Set())
  }

  function handleRowDelete(id) {
    onDelete(id)
    setSelectedIds(s => {
      if (!s.has(id)) return s
      const next = new Set(s); next.delete(id); return next
    })
  }

  const allOnPageSelected = runs.length > 0 && runs.every(r => selectedIds.has(r.id))
  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null
  const visiblePages = pageWindow(currentPage, furthestKnownPage)

  return (
    <div style={{
      width: 336, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-panel)',
    }}>
      <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative', marginBottom: 9 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
            <Icon.search size={14} />
          </span>
          <input
            className="search-input"
            placeholder="Search traces…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearch}
            style={{
              width: '100%', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 9,
              padding: '8px 10px 8px 31px', color: 'var(--text)',
              fontSize: 13, transition: 'box-shadow 0.12s, border-color 0.12s',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {statuses.map(s => {
            const active = filters.status === s
            return (
              <button key={s || 'all'} onClick={() => onFilter(f => ({ ...f, status: s }))} style={{
                fontSize: 11.5, padding: '4px 11px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text-dim)',
                fontWeight: active ? 600 : 500, transition: 'all 0.12s',
              }}>{labels[s]}</button>
            )
          })}
          <div style={{ flex: 1 }} />
          <FilterPopover filters={filters} onApply={onFilter} projectId={projectId} />
          <button onClick={toggleSort} title={filters.sort === 'desc' ? 'Newest first' : 'Oldest first'} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
          }}>
            <Icon.chevron size={13} style={{ transform: filters.sort === 'asc' ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>
      </div>

      {runs.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 16px', borderBottom: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0,
        }}>
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} style={{ cursor: 'pointer' }} />
          <span>Select all on page</span>
          {selectedIds.size > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{selectedIds.size} selected</span>
              <button onClick={() => setShowBatchDeleteModal(true)} style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontWeight: 600,
              }}>Delete</button>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && runs.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div className="spinner" />
          </div>
        )}
        {!loading && runs.length === 0 && (
          <div style={{ padding: '40px 24px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 4, color: 'var(--text-dim)', fontWeight: 600 }}>No traces yet</div>
            <span style={{ fontSize: 12 }}>Enable tracing and run a minion to get started.</span>
          </div>
        )}
        {runs.map(r => (
          <div key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <RunRow
              run={r} selected={r.id === selectedId} onSelect={onSelect} onDelete={handleRowDelete}
              checked={selectedIds.has(r.id)} onToggleCheck={toggleCheck}
            />
          </div>
        ))}
      </div>

      {totalCount != null && totalCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} style={pageBtnStyle(false)}>‹</button>
          {visiblePages.map(p => (
            <button key={p} onClick={() => onPageChange(p)} style={pageBtnStyle(p === currentPage)}>{p}</button>
          ))}
          <button disabled={!hasNextPage && currentPage >= furthestKnownPage} onClick={() => onPageChange(currentPage + 1)} style={pageBtnStyle(false)}>›</button>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
            Page {currentPage} of ~{totalPages}
          </span>
        </div>
      )}

      {showBatchDeleteModal && (
        <BatchDeleteModal
          selectedIds={selectedIds}
          filters={filters}
          projectId={projectId}
          filterCount={totalCount}
          onClose={() => setShowBatchDeleteModal(false)}
          onDeleted={() => {
            setSelectedIds(new Set())
            setShowBatchDeleteModal(false)
            onBulkDeleted()
          }}
        />
      )}
    </div>
  )
}
