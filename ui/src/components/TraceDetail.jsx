import { useState, useEffect } from 'react'
import AddModelModal from './AddModelModal'
import {
  STATUS, statusColor, fmtCost, fmtMs, fmtTs, fmtCompact,
  shortModel, toolIconFor, Icon,
} from '../lib'

function StatusPill({ status }) {
  const color = statusColor(status)
  const label = (STATUS[status] || {}).label || status
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 600, padding: '4px 11px',
      borderRadius: 20, background: color + '14', color,
    }}>
      <span className={status === 'running' ? 'live-dot' : ''}
        style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function Stat({ label, value, title, onClick, accent }) {
  return (
    <div onClick={onClick} title={title} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: accent ? 'var(--accent-text)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}

function Section({ icon: IconCmp, title, accent, children, collapsible, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      background: 'var(--bg-panel)', overflow: 'hidden', marginBottom: 12,
    }}>
      <div
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', cursor: collapsible ? 'pointer' : 'default',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        {IconCmp && <span style={{ color: accent || 'var(--text-dim)', display: 'flex' }}><IconCmp size={15} /></span>}
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text)', letterSpacing: 0.1 }}>{title}</span>
        <div style={{ flex: 1 }} />
        {right}
        {collapsible && (
          <span style={{ color: 'var(--text-muted)', display: 'flex', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
            <Icon.chevron size={16} />
          </span>
        )}
      </div>
      {open && children}
    </div>
  )
}

function ToolCall({ tc, onSelect }) {
  const [open, setOpen] = useState(false)
  const isFinish = tc.tool_name === '_finish'
  const ToolIcon = toolIconFor(tc.tool_name)
  const accent = isFinish ? 'var(--green)' : 'var(--accent)'
  const argStr = typeof tc.args === 'object'
    ? Object.entries(tc.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
    : String(tc.args || '')

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      background: isFinish ? 'var(--bg-result)' : 'var(--bg-tool)', overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer',
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: isFinish ? 'var(--green-soft)' : 'var(--accent-soft)', color: accent,
        }}><ToolIcon size={14} /></span>
        <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
          <span className="mono" style={{ color: accent, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>{tc.tool_name}</span>
          {argStr && (
            <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {argStr}
            </span>
          )}
        </span>
        {tc.sub_trace_id && (
          <button onClick={e => { e.stopPropagation(); onSelect && onSelect(tc.sub_trace_id) }} style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
            border: '1px solid var(--border-strong)', background: 'var(--bg-panel)',
            color: 'var(--accent-text)', cursor: 'pointer',
          }}>
            {tc.sub_status && <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(tc.sub_status) }} />}
            Open trace ↗
          </button>
        )}
        <span className="tnum" style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{fmtMs(tc.latency_ms)}</span>
        <span style={{ color: 'var(--text-muted)', display: 'flex', flexShrink: 0, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
          <Icon.chevron size={14} />
        </span>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg-panel)' }}>
          {argStr && (
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Arguments</FieldLabel>
              <pre className="mono" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{argStr}</pre>
            </div>
          )}
          <FieldLabel>Result</FieldLabel>
          <pre className="mono" style={{ color: isFinish ? 'var(--green)' : 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' }}>
            {tc.result != null && tc.result !== '' ? String(tc.result) : '(none)'}
          </pre>
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, fontWeight: 600 }}>{children}</div>
}

function Turn({ turn, index, onSelect }) {
  const [open, setOpen] = useState(true)
  const tokens = (turn.input_tokens || 0) + (turn.output_tokens || 0)
  return (
    <div style={{ marginBottom: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 8 : 0,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 22, height: 22, padding: '0 6px', borderRadius: 7,
          background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 700,
        }} className="tnum">{index + 1}</span>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text)' }}>Turn</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span className="tnum" style={{ display: 'flex', gap: 10, color: 'var(--text-muted)', fontSize: 11 }}>
          {tokens > 0 && <span>{fmtCompact(tokens)} tok</span>}
          <span>{fmtMs(turn.latency_ms)}</span>
        </span>
        <span style={{ color: 'var(--text-muted)', display: 'flex', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
          <Icon.chevron size={15} />
        </span>
      </div>
      {open && (
        <div style={{ paddingLeft: 30 }}>
          {turn.thought && (
            <div style={{
              fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 8,
              paddingLeft: 12, borderLeft: '2px solid var(--border-strong)',
            }}>
              {turn.thought}
            </div>
          )}
          {(turn.tool_calls || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {turn.tool_calls.map((tc, i) => <ToolCall key={i} tc={tc} onSelect={onSelect} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TraceDetail({ traceId, onSelect }) {
  const [trace, setTrace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [addModelOpen, setAddModelOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!traceId) { setTrace(null); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/traces/${traceId}`)
        if (!cancelled) setTrace(res.ok ? await res.json() : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const iv = setInterval(async () => {
      if (cancelled) return
      const res = await fetch(`/api/traces/${traceId}`)
      if (!cancelled && res.ok) {
        const data = await res.json()
        setTrace(data)
        if (data.status !== 'running') clearInterval(iv)
      }
    }, 2000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [traceId, refreshKey])

  if (!traceId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', background: 'var(--bg)' }}>
        <span style={{ color: 'var(--border-strong)' }}><Icon.list size={40} /></span>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>Select a trace</div>
        <div style={{ fontSize: 12.5 }}>Pick a run from the left to inspect it</div>
      </div>
    )
  }

  if (loading && !trace) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><div className="spinner" /></div>
  }
  if (!trace) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)', background: 'var(--bg)' }}>Trace not found</div>
  }

  const inTok = trace.total_input_tokens || 0
  const outTok = trace.total_output_tokens || 0

  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* header: metrics only */}
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        {trace.parent_trace_id && (
          <button onClick={() => onSelect(trace.parent_trace_id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 11,
            padding: '4px 10px 4px 7px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg-subtle)',
            color: 'var(--accent-text)', fontSize: 12, fontWeight: 600,
          }}>
            <Icon.back size={14} /> Back to parent trace
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 13 }}>
          {trace.parent_trace_id && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
              <Icon.branch size={13} /> Sub-minion
            </span>
          )}
          <StatusPill status={trace.status} />
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)' }}>{trace.model}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtTs(trace.created_at)}</span>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <Stat label="Tokens" value={fmtCompact(inTok + outTok)} title={`${inTok} in · ${outTok} out`} />
          <Stat label="In / Out" value={`${fmtCompact(inTok)} / ${fmtCompact(outTok)}`} />
          {trace.estimated_cost != null
            ? <Stat label="Cost" value={fmtCost(trace.estimated_cost)} accent />
            : <Stat label="Cost" value="add pricing" accent onClick={() => setAddModelOpen(true)} title={`Add pricing for ${trace.model}`} />}
          <Stat label="Latency" value={fmtMs(trace.total_latency_ms)} />
          <Stat label="Turns" value={(trace.turns || []).length} />
          {(trace.sub_traces || []).length > 0 && <Stat label="Sub-minions" value={trace.sub_traces.length} />}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
        {trace.system_prompt && (
          <Section icon={Icon.spark} title="System prompt" collapsible defaultOpen={trace.system_prompt.length < 280}>
            <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {trace.system_prompt}
            </div>
          </Section>
        )}

        <Section icon={Icon.terminal} title="Input">
          <div style={{ padding: '12px 14px', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {trace.input || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
          </div>
        </Section>

        {(() => {
          const tools = (trace.tools || []).filter(t => t !== '_finish')
          if (!tools.length) return null
          return (
            <Section icon={Icon.wrench} title={`Tools available · ${tools.length}`} collapsible defaultOpen={tools.length <= 12}>
              <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tools.map(name => {
                  const TI = toolIconFor(name)
                  return (
                    <span key={name} className="mono" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, padding: '4px 10px', borderRadius: 7,
                      background: 'var(--bg-tool)', border: '1px solid var(--border)', color: 'var(--text-dim)',
                    }}>
                      <span style={{ color: 'var(--accent)', display: 'flex' }}><TI size={13} /></span>
                      {name}
                    </span>
                  )
                })}
              </div>
            </Section>
          )
        })()}

        {(trace.turns || []).length > 0 && (
          <Section icon={Icon.layers} title={`Execution · ${trace.turns.length} turn${trace.turns.length === 1 ? '' : 's'}`}>
            <div style={{ padding: '14px 16px 6px' }}>
              {trace.turns.map((t, i) => <Turn key={t.id} turn={t} index={i} onSelect={onSelect} />)}
            </div>
          </Section>
        )}

        {trace.status === 'running' && !(trace.turns || []).length && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', color: 'var(--text-dim)' }}>
            <div className="spinner" /> Waiting for first turn…
          </div>
        )}

        {trace.status === 'failed' && trace.error && (
          <Section icon={Icon.alert} title="Error" accent="var(--red)" collapsible defaultOpen={trace.error.length < 600}>
            <pre className="mono" style={{
              padding: '14px 16px', background: 'var(--bg-error)',
              color: 'var(--red)', fontSize: 12.5, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 420, overflowY: 'auto', margin: 0,
            }}>{trace.error}</pre>
          </Section>
        )}

        {trace.output && (
          <Section icon={Icon.check} title="Output" accent="var(--green)">
            <div style={{
              padding: '14px 16px', background: 'var(--bg-result)',
              color: 'var(--green)', fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
            }}>{trace.output}</div>
          </Section>
        )}
      </div>
    </div>

    {addModelOpen && (
      <AddModelModal
        project={{ id: trace.project_id }}
        initialModelName={trace.model}
        onSave={() => { setAddModelOpen(false); setRefreshKey(k => k + 1) }}
        onClose={() => setAddModelOpen(false)}
      />
    )}
    </>
  )
}
