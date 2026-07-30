import { useState, useEffect, useRef } from 'react'
import { STATUS, statusColor, fmtCost, fmtMs, fmtRelative, fmtCompact, shortModel, Icon } from '../lib'
import DeleteModal from './DeleteModal'

function MetaItem({ children, mono, title }) {
  return (
    <span className={`tnum${mono ? ' mono' : ''}`} title={title} style={{
      fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

// Only surface a status badge for the states worth calling out — running and
// failed. Completed is the expected norm, so it stays unlabeled (cleaner tile).
function StatusBadge({ status }) {
  if (status !== 'running' && status !== 'failed') return null
  const color = statusColor(status)
  const label = (STATUS[status] || {}).label || status
  return (
    <span style={{
      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: color + '14', color,
    }}>
      <span className={status === 'running' ? 'live-dot' : ''}
        style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function RunRow({ run, selected, onSelect, onRequestDelete, checked, onToggleCheck, anySelected }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const preview = (run.input || '').replace(/\s+/g, ' ').trim()
  const tokens = (run.total_input_tokens || 0) + (run.total_output_tokens || 0)

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  const showDots = hovered || menuOpen
  const showCheckbox = hovered || checked || menuOpen || anySelected

  return (
    <div
      onClick={() => onSelect(run.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 12px 12px 14px',
        borderRadius: 12,
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--bg-item-sel)' : 'var(--bg-panel)',
        boxShadow: selected ? 'none' : hovered ? 'var(--shadow-sm)' : 'none',
        cursor: 'pointer',
        transition: 'box-shadow 0.12s, border-color 0.12s, background 0.12s',
      }}
    >
      {/* selection slot — empty until you hover or start selecting (no status dot) */}
      <span style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showCheckbox && (
          <input
            type="checkbox" checked={checked}
            onClick={e => e.stopPropagation()}
            onChange={e => onToggleCheck(run.id, e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
        )}
      </span>

      {/* preview — single line, ellipsized */}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)', fontWeight: 550,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {preview || <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(empty input)</span>}
      </span>

      <StatusBadge status={run.status} />

      {/* tags */}
      {(run.tags || []).slice(0, 2).map(t => (
        <span key={t} style={{
          flexShrink: 0, fontSize: 10.5, padding: '2px 8px', borderRadius: 5,
          background: 'var(--accent-soft)', color: 'var(--accent-text)', fontWeight: 600,
          whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{t}</span>
      ))}

      {/* metric cluster */}
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <MetaItem mono title="Model">{shortModel(run.model)}</MetaItem>
        {tokens > 0 && <MetaItem title="Total tokens">{fmtCompact(tokens)} tok</MetaItem>}
        {run.estimated_cost != null && <MetaItem title="Estimated cost">{fmtCost(run.estimated_cost)}</MetaItem>}
        {run.total_latency_ms ? <MetaItem title="Latency">{fmtMs(run.total_latency_ms)}</MetaItem> : null}
        <MetaItem title={run.created_at}>{fmtRelative(run.created_at)}</MetaItem>
      </span>

      {/* actions slot — reserved so hover never shifts the metrics */}
      <span style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showDots && (
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 6,
              background: 'var(--bg)', border: '1px solid var(--border)',
              cursor: 'pointer', color: 'var(--text-dim)',
            }}
          ><Icon.dots size={15} /></button>
        )}
      </span>

      {menuOpen && (
        <div ref={menuRef} onClick={e => e.stopPropagation()} style={{
          position: 'absolute', top: 40, right: 10,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100,
          minWidth: 130, overflow: 'hidden',
        }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(false); onRequestDelete(run.id) }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-error)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none', textAlign: 'left',
              color: 'var(--red)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
            }}
          ><Icon.trash size={14} /> Delete trace</button>
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
  minWidth: 26, height: 26, padding: '0 6px', borderRadius: 7, cursor: 'pointer',
  border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#fff' : 'var(--text-dim)',
  fontSize: 11.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
})

export default function RunList({
  runs, loading, filters, onFilter, filtersOpen, onToggleFilters,
  selectedId, onSelect, onDelete,
  projectId, pageSize, currentPage, furthestKnownPage, hasNextPage, totalCount,
  onPageChange, onBulkDeleted,
}) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const [selectedIds, setSelectedIds] = useState(new Set())
  // deleteTarget: { mode: 'single', id } | { mode: 'batch' } | null
  const [deleteTarget, setDeleteTarget] = useState(null)

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

  // Apply the result of a confirmed deletion to local state.
  function applyDeleted(ids) {
    setDeleteTarget(null)
    if (ids == null) {
      // bulk-by-filter: count unknown, let App refetch the page + count
      setSelectedIds(new Set())
      onBulkDeleted()
      return
    }
    for (const id of ids) onDelete(id)
    setSelectedIds(s => {
      const next = new Set(s)
      for (const id of ids) next.delete(id)
      return next
    })
    // A batch removal can empty the page; let App reconcile pagination/count.
    if (ids.length > 1) onBulkDeleted()
  }

  const allOnPageSelected = runs.length > 0 && runs.every(r => selectedIds.has(r.id))
  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null
  const visiblePages = pageWindow(currentPage, furthestKnownPage)
  const selecting = selectedIds.size > 0
  const activeFilterCount = (filters.status ? 1 : 0) + (filters.model ? 1 : 0)
    + (filters.metadataPairs || []).length + (filters.createdAfter ? 1 : 0) + (filters.createdBefore ? 1 : 0)
  const filtersActive = filtersOpen || activeFilterCount > 0

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        background: 'var(--bg-panel)',
      }}>
        <button onClick={onToggleFilters} style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px',
          borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit',
          border: `1px solid ${filtersActive ? 'transparent' : 'var(--border)'}`,
          background: filtersActive ? 'var(--accent)' : 'transparent',
          color: filtersActive ? '#fff' : 'var(--text-dim)',
          fontWeight: filtersActive ? 600 : 500, transition: 'all 0.12s',
        }}>
          <Icon.filter size={14} />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}>
            <Icon.search size={15} />
          </span>
          <input
            className="search-input"
            placeholder="Search input & output…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearch}
            style={{
              width: '100%', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 9,
              padding: '9px 12px 9px 34px', color: 'var(--text)',
              fontSize: 13, transition: 'box-shadow 0.12s, border-color 0.12s',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={toggleSort} title={filters.sort === 'desc' ? 'Newest first' : 'Oldest first'} style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px',
          borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
          border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
        }}>
          {filters.sort === 'desc' ? 'Newest' : 'Oldest'}
          <Icon.chevron size={13} style={{ transform: filters.sort === 'asc' ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {/* selection bar */}
      {runs.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 20px 7px 26px', borderBottom: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-muted)', flexShrink: 0,
          background: selecting ? 'var(--accent-soft)' : 'var(--bg-panel)', transition: 'background 0.12s',
        }}>
          <span style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
            <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} style={{ cursor: 'pointer' }} />
          </span>
          {selecting ? (
            <>
              <span style={{ color: 'var(--accent-text)', fontWeight: 650 }}>{selectedIds.size} selected</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setSelectedIds(new Set())} style={{
                fontSize: 11.5, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-dim)', fontFamily: 'inherit',
              }}>Clear</button>
              <button onClick={() => setDeleteTarget({ mode: 'batch' })} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11.5, padding: '4px 11px', borderRadius: 7, cursor: 'pointer',
                border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 600, fontFamily: 'inherit',
              }}><Icon.trash size={13} /> Delete</button>
            </>
          ) : (
            <span>Select all on page</span>
          )}
        </div>
      )}

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && runs.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div className="spinner" />
          </div>
        )}
        {!loading && runs.length === 0 && (
          <div style={{ padding: '60px 24px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 4, color: 'var(--text-dim)', fontWeight: 600 }}>No traces yet</div>
            <span style={{ fontSize: 12 }}>Enable tracing and run a minion to get started.</span>
          </div>
        )}
        {runs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 12px 16px' }}>
            {runs.map(r => (
              <RunRow
                key={r.id}
                run={r} selected={r.id === selectedId} onSelect={onSelect}
                onRequestDelete={id => setDeleteTarget({ mode: 'single', id })}
                checked={selectedIds.has(r.id)} onToggleCheck={toggleCheck} anySelected={selecting}
              />
            ))}
          </div>
        )}
      </div>

      {/* pagination */}
      {totalCount != null && totalCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0,
          background: 'var(--bg-panel)',
        }}>
          <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} style={pageBtnStyle(false)}>‹</button>
          {visiblePages.map(p => (
            <button key={p} onClick={() => onPageChange(p)} style={pageBtnStyle(p === currentPage)}>{p}</button>
          ))}
          <button disabled={!hasNextPage && currentPage >= furthestKnownPage} onClick={() => onPageChange(currentPage + 1)} style={pageBtnStyle(false)}>›</button>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            Page {currentPage} of ~{totalPages}
          </span>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          mode={deleteTarget.mode}
          id={deleteTarget.id}
          selectedIds={selectedIds}
          filters={filters}
          projectId={projectId}
          filterCount={totalCount}
          onClose={() => setDeleteTarget(null)}
          onDeleted={applyDeleted}
        />
      )}
    </div>
  )
}
