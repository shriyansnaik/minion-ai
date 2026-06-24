import { useState, useEffect, useCallback, useRef } from 'react'
import ProjectSelect from './components/ProjectSelect'
import RunList from './components/RunList'
import TraceDetail from './components/TraceDetail'
import Analytics from './components/Analytics'
import SettingsModal from './components/SettingsModal'
import { Icon } from './lib'

const PAGE_SIZE = 50

function TopBar({ project, tab, onTab, onBack, onSettings, runCount }) {
  const tabs = [
    { id: 'traces', label: 'Traces', icon: Icon.list },
    { id: 'analytics', label: 'Analytics', icon: Icon.chart },
  ]
  return (
    <div style={{
      height: 52, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 16px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
    }}>
      <button onClick={onBack} title="All projects" style={iconBtn}>
        <Icon.back size={18} />
      </button>

      <img src="/minions-icon.svg" alt="" style={{ height: 22, width: 22 }} onError={e => { e.currentTarget.style.display = 'none' }} />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, marginRight: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
          {project.name}
        </span>
      </div>

      <div style={{
        display: 'flex', gap: 2, padding: 3,
        background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)',
      }}>
        {tabs.map(t => {
          const active = tab === t.id
          const TabIcon = t.icon
          return (
            <button key={t.id} onClick={() => onTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: active ? 'var(--bg-panel)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--text-dim)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.12s',
            }}>
              <TabIcon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {tab === 'traces' && runCount != null && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }} className="tnum">
          {runCount} trace{runCount === 1 ? '' : 's'}
        </span>
      )}
      <button onClick={onSettings} title="Settings" style={iconBtn}>
        <Icon.settings size={17} />
      </button>
    </div>
  )
}

const iconBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8,
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-dim)', transition: 'background 0.12s',
}

function readUrlState() {
  const m = window.location.pathname.match(/^\/project\/([^/]+)(?:\/trace\/([^/]+))?\/?$/)
  return { projectId: m ? decodeURIComponent(m[1]) : null, traceId: m && m[2] ? decodeURIComponent(m[2]) : null }
}

function writeUrlState(projectId, traceId) {
  let url = '/'
  if (projectId) {
    url = `/project/${encodeURIComponent(projectId)}`
    if (traceId) url += `/trace/${encodeURIComponent(traceId)}`
  }
  if (url === window.location.pathname) return
  window.history.pushState(null, '', url)
}

const EMPTY_FILTERS = {
  search: '', status: '', model: '',
  metadataPairs: [], // [{key, value}, ...] — ANDed together
  createdAfter: '', createdBefore: '',
  sort: 'desc',
}

function filterParams(filters) {
  const p = new URLSearchParams()
  if (filters.search) p.set('search', filters.search)
  if (filters.status) p.set('status', filters.status)
  if (filters.model) p.set('model', filters.model)
  for (const { key, value } of filters.metadataPairs || []) {
    if (!key) continue
    p.append('metadata_key', key)
    p.append('metadata_value', value)
  }
  if (filters.createdAfter) p.set('created_after', filters.createdAfter)
  if (filters.createdBefore) p.set('created_before', filters.createdBefore)
  return p
}

export default function App() {
  const [project, setProject] = useState(null)
  const [tab, setTab] = useState('traces')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [runs, setRuns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [resolvingUrl, setResolvingUrl] = useState(() => !!readUrlState().projectId)

  // Keyset pagination: cursorsRef caches "cursor to fetch page N" outside of
  // React state (it's a write-through cache, not something that needs to
  // re-render on its own — currentPage/hasNextPage are the reactive signals
  // pagination UI actually reads).
  const cursorsRef = useRef({ 1: null })
  const [currentPage, setCurrentPage] = useState(1)
  const [furthestKnownPage, setFurthestKnownPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalCount, setTotalCount] = useState(null)

  const loadProjectById = useCallback(async (projectId) => {
    try {
      const res = await fetch('/api/projects')
      const list = await res.json()
      return list.find(p => p.id === projectId) || null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const { projectId, traceId } = readUrlState()
    if (!projectId) return
    loadProjectById(projectId).then(found => {
      if (found) {
        setProject(found)
        setSelectedId(traceId || null)
      } else {
        writeUrlState(null, null)
      }
    }).finally(() => setResolvingUrl(false))
  }, [loadProjectById])

  useEffect(() => {
    function onPopState() {
      const { projectId, traceId } = readUrlState()
      if (!projectId) {
        setProject(null)
        setRuns([])
        setSelectedId(null)
        setTab('traces')
        setFilters(EMPTY_FILTERS)
        return
      }
      setProject(prev => {
        if (prev && prev.id === projectId) return prev
        loadProjectById(projectId).then(found => { if (found) setProject(found) })
        return prev
      })
      setSelectedId(traceId || null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loadProjectById])

  // Reset pagination whenever the result set could have changed shape.
  useEffect(() => {
    cursorsRef.current = { 1: null }
    setCurrentPage(1)
    setFurthestKnownPage(1)
    setHasNextPage(false)
  }, [filters, cursorsRef])

  const fetchRuns = useCallback(async (page) => {
    if (!project) return null
    try {
      const p = filterParams(filters)
      p.set('project_id', project.id)
      p.set('sort', filters.sort)
      p.set('limit', String(PAGE_SIZE))
      const cursor = cursorsRef.current[page]
      if (cursor) p.set('cursor', cursor)
      const res = await fetch(`/api/traces?${p}`)
      const data = await res.json()
      setRuns(data.items)
      if (data.next_cursor) {
        cursorsRef.current[page + 1] = data.next_cursor
        setFurthestKnownPage(fp => Math.max(fp, page + 1))
      }
      setHasNextPage(!!data.next_cursor)
      return data.items.length
    } catch {
      // server unreachable — keep stale data
      return null
    } finally {
      setLoading(false)
    }
  }, [project, filters, cursorsRef])

  useEffect(() => {
    if (!project || tab !== 'traces') return
    setLoading(true)
    fetchRuns(currentPage)
    const id = setInterval(() => fetchRuns(currentPage), 3000)
    return () => clearInterval(id)
  }, [fetchRuns, project, tab, currentPage])

  useEffect(() => {
    if (!project) return
    const p = filterParams(filters)
    p.set('project_id', project.id)
    fetch(`/api/traces/count?${p}`).then(r => r.json()).then(d => setTotalCount(d.count)).catch(() => {})
  }, [project, filters])

  function goToPage(page) {
    if (page < 1 || page > furthestKnownPage) return
    setCurrentPage(page)
  }

  async function refetchAfterBulkDelete() {
    let page = currentPage
    let count = await fetchRuns(page)
    if (count === 0 && page > 1) {
      page -= 1
      setCurrentPage(page)
      await fetchRuns(page)
    }
    const p = filterParams(filters)
    p.set('project_id', project.id)
    fetch(`/api/traces/count?${p}`).then(r => r.json()).then(d => setTotalCount(d.count)).catch(() => {})
  }

  function handleDelete(id) {
    setRuns(rs => rs.filter(r => r.id !== id))
    setTotalCount(c => (c != null ? Math.max(0, c - 1) : c))
    if (selectedId === id) selectTrace(null)
  }

  function handleBack() {
    setProject(null)
    setRuns([])
    setSelectedId(null)
    setTab('traces')
    setFilters(EMPTY_FILTERS)
    writeUrlState(null, null)
  }

  function selectProject(p) {
    setProject(p)
    setRuns([])
    setSelectedId(null)
    setTab('traces')
    writeUrlState(p.id, null)
  }

  function selectTrace(id) {
    setSelectedId(id)
    writeUrlState(project?.id, id)
  }

  if (resolvingUrl) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  }

  if (!project) {
    return <ProjectSelect onSelect={selectProject} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        project={project}
        tab={tab}
        onTab={setTab}
        onBack={handleBack}
        onSettings={() => setSettingsOpen(true)}
        runCount={totalCount != null ? totalCount : runs.length}
      />
      {tab === 'traces' ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <RunList
            runs={runs}
            loading={loading}
            filters={filters}
            onFilter={setFilters}
            selectedId={selectedId}
            onSelect={selectTrace}
            onDelete={handleDelete}
            projectId={project.id}
            pageSize={PAGE_SIZE}
            currentPage={currentPage}
            furthestKnownPage={furthestKnownPage}
            hasNextPage={hasNextPage}
            totalCount={totalCount}
            onPageChange={goToPage}
            onBulkDeleted={refetchAfterBulkDelete}
          />
          <TraceDetail traceId={selectedId} onSelect={selectTrace} />
        </div>
      ) : (
        <Analytics project={project} />
      )}
      {settingsOpen && <SettingsModal project={project} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
