// Shared formatting helpers, status colors, and inline SVG icons.

export const STATUS = {
  running:   { color: '#5B53E8', label: 'Running' },
  completed: { color: '#1D8348', label: 'Completed' },
  failed:    { color: '#D93025', label: 'Failed' },
}

export function statusColor(s) {
  return (STATUS[s] || { color: '#9A9AA0' }).color
}

export function fmtCost(c) {
  if (c == null) return '—'
  if (c === 0) return '$0'
  if (c < 0.001) return `$${c.toFixed(6)}`
  if (c < 0.01) return `$${c.toFixed(5)}`
  if (c < 1) return `$${c.toFixed(4)}`
  return `$${c.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtMs(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

export function fmtCompact(n) {
  if (n == null) return '—'
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function fmtTokens(inp, out) {
  const total = (inp || 0) + (out || 0)
  if (!total) return '—'
  return `${fmtCompact(total)} tok`
}

export function fmtTs(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 10000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function shortModel(model) {
  return (model || '').split('/').pop()
}

// ── Icons ──────────────────────────────────────────────────────────────
// Minimal stroke icons; inherit color via currentColor.

function Svg({ size = 16, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  )
}

export const Icon = {
  wrench: p => <Svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8a1.5 1.5 0 0 0 2.1 2.1l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-2.1z" /></Svg>,
  check: p => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>,
  flag: p => <Svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></Svg>,
  branch: p => <Svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="9" r="2.5" /><path d="M6 8.5v7M6 12h6a3 3 0 0 0 3-3" /></Svg>,
  globe: p => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></Svg>,
  search: p => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>,
  file: p => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>,
  terminal: p => <Svg {...p}><path d="m5 8 4 4-4 4M12 16h7" /></Svg>,
  database: p => <Svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>,
  settings: p => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></Svg>,
  back: p => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>,
  chevron: p => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>,
  dots: p => <Svg {...p} strokeWidth="2.2"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>,
  list: p => <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>,
  chart: p => <Svg {...p}><path d="M3 3v18h18" /><path d="m7 14 3-3 3 3 5-5" /></Svg>,
  spark: p => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></Svg>,
  coin: p => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></Svg>,
  bolt: p => <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Svg>,
  layers: p => <Svg {...p}><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></Svg>,
  plus: p => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  alert: p => <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Svg>,
}

// Pick a tool icon by name heuristics.
export function toolIconFor(name) {
  const n = (name || '').toLowerCase()
  if (n === '_finish') return Icon.flag
  if (n === '_spawn_sub_minion' || n.includes('sub_minion') || n.includes('spawn')) return Icon.branch
  if (n.includes('search') || n.includes('google') || n.includes('query')) return Icon.search
  if (n.includes('http') || n.includes('url') || n.includes('web') || n.includes('fetch') || n.includes('browse')) return Icon.globe
  if (n.includes('file') || n.includes('read') || n.includes('write') || n.includes('doc')) return Icon.file
  if (n.includes('sql') || n.includes('db') || n.includes('database')) return Icon.database
  if (n.includes('shell') || n.includes('bash') || n.includes('exec') || n.includes('run') || n.includes('command')) return Icon.terminal
  return Icon.wrench
}
