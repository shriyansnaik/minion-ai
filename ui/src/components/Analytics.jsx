import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie,
} from 'recharts'
import { fmtCost, fmtCompact, fmtMs, shortModel, Icon } from '../lib'

const PALETTE = ['#5B53E8', '#1D8348', '#E8923B', '#3B9AE8', '#C94FB0', '#E85B7A', '#39B8A6', '#8E6FE8']

function Card({ title, icon: IconCmp, children, full }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 18px',
      gridColumn: full ? '1 / -1' : 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        {IconCmp && <span style={{ color: 'var(--text-dim)', display: 'flex' }}><IconCmp size={15} /></span>}
        <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, icon: IconCmp, accent }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 8,
          background: accent ? 'var(--accent-soft)' : 'var(--bg)', color: accent ? 'var(--accent-text)' : 'var(--text-dim)',
        }}><IconCmp size={15} /></span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div className="tnum" style={{ fontSize: 23, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="tnum" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function TipBox({ rows }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, padding: '8px 11px', boxShadow: 'var(--shadow-md)', fontSize: 12,
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text)', padding: '1px 0' }} className="tnum">
          {r.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />}
          <span style={{ color: 'var(--text-dim)' }}>{r.label}</span>
          <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS = { fontSize: 11, fill: '#9A9AA4' }
const fmtDay = d => { const [, m, day] = (d || '').split('-'); return m ? `${+m}/${+day}` : d }

export default function Analytics({ project }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/analytics?project_id=${project.id}`)
        if (!cancelled && res.ok) setData(await res.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const iv = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [project.id])

  if (loading && !data) {
    return <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)' }}><div className="spinner" /></div>
  }

  const s = data?.summary
  if (!s || s.runs === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, color: 'var(--text-muted)', background: 'var(--bg)' }}>
        <span style={{ color: 'var(--border-strong)' }}><Icon.chart size={42} /></span>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>No analytics yet</div>
        <div style={{ fontSize: 12.5 }}>Run a few traces in this project to see metrics here.</div>
      </div>
    )
  }

  const daily = data.daily
  const models = data.by_model.slice(0, 8).map((m, i) => ({ ...m, name: shortModel(m.model), color: PALETTE[i % PALETTE.length] }))
  const statusData = [
    { name: 'Completed', value: s.completed, color: '#1D8348' },
    { name: 'Failed', value: s.failed, color: '#D93025' },
    { name: 'Running', value: s.running, color: '#5B53E8' },
  ].filter(d => d.value > 0)

  return (
    <div className="fadein" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: '18px 22px' }}>
      {s.has_unpriced && (
        <div style={{
          marginBottom: 14, padding: '9px 13px', borderRadius: 'var(--radius-sm)',
          background: '#FFF8EC', border: '1px solid #F0E0C0', color: 'var(--amber)', fontSize: 12,
        }}>
          Some runs use models without pricing — spend figures exclude them. Add pricing in Settings.
        </div>
      )}

      {/* summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="Traces" value={fmtCompact(s.runs)} sub={s.sub_runs ? `+${fmtCompact(s.sub_runs)} sub-minions` : null} icon={Icon.list} accent />
        <StatCard label="Total spend" value={fmtCost(s.cost)} sub="incl. sub-minions" icon={Icon.coin} />
        <StatCard label="Tokens" value={fmtCompact(s.tokens)} sub={`${fmtCompact(s.input_tokens)} in · ${fmtCompact(s.output_tokens)} out`} icon={Icon.spark} />
        <StatCard label="Avg latency" value={fmtMs(s.avg_latency_ms)} sub="completed runs" icon={Icon.bolt} />
        <StatCard label="Success rate" value={s.success_rate == null ? '—' : `${Math.round(s.success_rate * 100)}%`} sub={`${s.completed} ok · ${s.failed} failed`} icon={Icon.check} />
      </div>

      {/* charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <Card title="Spend over time" icon={Icon.coin} full>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="g-cost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B53E8" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#5B53E8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tickFormatter={v => fmtCost(v)} tick={AXIS} tickLine={false} axisLine={false} width={62} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length
                ? <TipBox rows={[{ label: fmtDay(label), value: fmtCost(payload[0].value), color: '#5B53E8' }]} /> : null} />
              <Area type="monotone" dataKey="cost" stroke="#5B53E8" strokeWidth={2} fill="url(#g-cost)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Tokens over time" icon={Icon.spark}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tickFormatter={fmtCompact} tick={AXIS} tickLine={false} axisLine={false} width={42} />
              <Tooltip cursor={{ fill: 'var(--bg-item-hover)' }} content={({ active, payload, label }) => active && payload?.length
                ? <TipBox rows={[
                    { label: 'Input', value: fmtCompact(payload[0]?.value), color: '#5B53E8' },
                    { label: 'Output', value: fmtCompact(payload[1]?.value), color: '#3B9AE8' },
                  ]} /> : null} />
              <Bar dataKey="input_tokens" stackId="t" fill="#5B53E8" radius={[0, 0, 0, 0]} />
              <Bar dataKey="output_tokens" stackId="t" fill="#3B9AE8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Status breakdown" icon={Icon.layers}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {statusData.map(d => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length
                  ? <TipBox rows={[{ label: payload[0].name, value: payload[0].value, color: payload[0].payload.color }]} /> : null} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statusData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }} className="tnum">
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color }} />
                  <span style={{ color: 'var(--text-dim)' }}>{d.name}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text)' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Cost by model" icon={Icon.coin} full>
          <ResponsiveContainer width="100%" height={Math.max(120, models.length * 42 + 20)}>
            <BarChart data={models} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtCost(v)} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={130} />
              <Tooltip cursor={{ fill: 'var(--bg-item-hover)' }} content={({ active, payload }) => active && payload?.length
                ? <TipBox rows={[
                    { label: 'Cost', value: fmtCost(payload[0].payload.cost), color: payload[0].payload.color },
                    { label: 'Runs', value: payload[0].payload.runs },
                    { label: 'Tokens', value: fmtCompact(payload[0].payload.tokens) },
                    { label: 'Avg latency', value: fmtMs(payload[0].payload.avg_latency_ms) },
                  ]} /> : null} />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={20}>
                {models.map(m => <Cell key={m.model} fill={m.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}
