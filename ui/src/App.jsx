import { useState, useEffect, useCallback } from 'react'
import ProjectSelect from './components/ProjectSelect'
import RunList from './components/RunList'
import TraceDetail from './components/TraceDetail'
import Analytics from './components/Analytics'
import SettingsModal from './components/SettingsModal'
import { Icon } from './lib'

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

export default function App() {
  const [project, setProject] = useState(null)
  const [tab, setTab] = useState('traces')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [runs, setRuns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ search: '', status: '', model: '' })

  const fetchRuns = useCallback(async () => {
    if (!project) return
    try {
      const p = new URLSearchParams({ project_id: project.id })
      if (filters.search) p.set('search', filters.search)
      if (filters.status) p.set('status', filters.status)
      if (filters.model) p.set('model', filters.model)
      const res = await fetch(`/api/traces?${p}`)
      setRuns(await res.json())
    } catch {
      // server unreachable — keep stale data
    } finally {
      setLoading(false)
    }
  }, [project, filters])

  useEffect(() => {
    if (!project || tab !== 'traces') return
    setLoading(true)
    fetchRuns()
    const id = setInterval(fetchRuns, 3000)
    return () => clearInterval(id)
  }, [fetchRuns, project, tab])

  function handleDelete(id) {
    setRuns(rs => rs.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function handleBack() {
    setProject(null)
    setRuns([])
    setSelectedId(null)
    setTab('traces')
    setFilters({ search: '', status: '', model: '' })
  }

  function selectProject(p) {
    setProject(p)
    setRuns([])
    setSelectedId(null)
    setTab('traces')
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
        runCount={runs.length}
      />
      {tab === 'traces' ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <RunList
            runs={runs}
            loading={loading}
            filters={filters}
            onFilter={setFilters}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
          />
          <TraceDetail traceId={selectedId} onSelect={setSelectedId} />
        </div>
      ) : (
        <Analytics project={project} />
      )}
      {settingsOpen && <SettingsModal project={project} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
