import { t as tr } from '../lib/i18n'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmtDay } from '../lib/format'
import { dateTicks, daysOf, invert, isoOf, linePath, linear, minorTicks, nearestIndex, niceDomain, thinEvery, tickValues } from '../lib/chartScale'

export type ChartPoint = { x: string | number; y: number; note?: string }
export type ChartSeries = { name: string; color?: string; points: ChartPoint[] }
type LineProps = {
  series: ChartSeries[]
  /** category = label setiap titik sama jarak; date = x ialah ISO (YYYY-MM-DD), kedudukan ikut masa sebenar; linear = x nombor */
  xKind?: 'category' | 'date' | 'linear'
  yUnit?: string
  /** had atas paksi menegak (cth. 100 untuk peratus) */
  yMax?: number
  yFloor?: number
  height?: number
  target?: { value: number; label: string }
  ariaLabel: string
  compact?: boolean
  formatX?: (x: string | number) => string
}
const PALETTE = ['var(--primary)', 'var(--info)', 'var(--warn)', 'var(--danger)', 'var(--ok)']

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (n: number) => setW(Math.max(180, Math.round(n)))
    set(el.getBoundingClientRect().width || initial)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => set(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, w] as const
}

/**
 * Graf garis sebenar: kotak plot bersempadan, grid mendatar dan menegak, tanda paksi (utama dan kecil), label berangka,
 * garis tebal dengan titik, garis sasaran, tooltip (tetikus, sentuh dan papan kekunci ←/→) dan jadual data untuk pembaca skrin.
 * Dilukis pada saiz piksel sebenar (bukan diregangkan) supaya titik kekal bulat dan teks tajam.
 */
export function LineChart({ series, xKind = 'category', yUnit = '', yMax, yFloor, height = 240, target, ariaLabel, compact = false, formatX }: LineProps) {
  const [wrap, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const fx = formatX ?? ((x: string | number) => (xKind === 'date' ? fmtDay(String(x)) : String(x)))

  const m = useMemo(() => {
    // ---- paksi x ----
    const keys: string[] = []
    if (xKind === 'category') for (const s of series) for (const p of s.points) if (!keys.includes(String(p.x))) keys.push(String(p.x))
    const xv = (p: ChartPoint) => (xKind === 'category' ? keys.indexOf(String(p.x)) : xKind === 'date' ? daysOf(String(p.x)) : Number(p.x))
    const pts = series.map((s) => ({ ...s, pts: s.points.map((p) => ({ ...p, xv: xv(p) })).filter((p) => Number.isFinite(p.xv) && Number.isFinite(p.y)).sort((a, b) => a.xv - b.xv) }))
    const allX = [...new Set(pts.flatMap((s) => s.pts.map((p) => p.xv)))].sort((a, b) => a - b)
    const allY = pts.flatMap((s) => s.pts.map((p) => p.y)).concat(target ? [target.value] : [])
    return { pts, allX, allY, keys }
  }, [series, xKind, target])

  const empty = m.allX.length === 0
  const yLo = empty ? 0 : Math.min(...m.allY), yHi = empty ? 1 : Math.max(...m.allY)
  const T = 12, R = 16, B = compact ? 26 : 32
  const ph = Math.max(40, height - T - B)
  // lebih tinggi = lebih banyak tanda (graf rujukan: setiap 10000), minimum 4 dan maksimum 10
  const dom = niceDomain(yLo, yHi, compact ? 3 : Math.min(10, Math.max(4, Math.floor(ph / 36))), yMax, yFloor)
  const yTicks = tickValues(dom)
  const fmtY = (v: number) => `${v}${yUnit}`
  const yLabelW = Math.max(...yTicks.map((v) => fmtY(v).length)) * 7
  const L = 18 + yLabelW
  const pw = Math.max(40, width - L - R)

  const x0 = empty ? 0 : m.allX[0], x1 = empty ? 1 : m.allX[m.allX.length - 1]
  const padX = xKind === 'category' ? 0.5 : Math.max((x1 - x0) * 0.03, xKind === 'date' ? 0.5 : 0.5)
  const dx0 = x0 - padX, dx1 = x1 + padX
  const X = linear(dx0, dx1, L, L + pw), Y = linear(dom.min, dom.max, T + ph, T)
  const unX = invert(dx0, dx1, L, L + pw)

  let xTicks: number[]
  if (xKind === 'category') xTicks = m.allX
  else if (xKind === 'date') xTicks = dateTicks(x0, x1, Math.max(2, Math.floor(pw / 64)))
  else { const d = niceDomain(x0, x1, Math.max(2, Math.floor(pw / 72))); xTicks = tickValues(d).filter((v) => v >= dx0 && v <= dx1) }
  const labelEvery = xKind === 'category' ? thinEvery(xTicks.length, pw, compact ? 48 : 62) : 1
  const labelOf = (v: number) => (xKind === 'category' ? fx(m.keys[v] ?? '') : xKind === 'date' ? fx(isoOf(v)) : fx(v))

  const dots = !m.pts.some((s) => s.pts.length > 40)
  const colorOf = (i: number) => m.pts[i].color ?? PALETTE[i % PALETTE.length]
  const activeX = active !== null ? m.allX[active] : null

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (empty) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    if (px < L - 8 || px > L + pw + 8) { setActive(null); return }
    setActive(nearestIndex(m.allX, unX(px)))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (empty) return
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((a) => Math.min(m.allX.length - 1, (a ?? -1) + 1)) }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((a) => Math.max(0, (a ?? m.allX.length) - 1)) }
    else if (e.key === "Home") { e.preventDefault(); setActive(0) }
    else if (e.key === "End") { e.preventDefault(); setActive(m.allX.length - 1) }
    else if (e.key === "Escape") setActive(null)
  }

  const tipRows = activeX === null ? [] : m.pts.map((s, i) => ({ s, i, p: s.pts.find((q) => q.xv === activeX) })).filter((r) => r.p)
  const tipLeft = activeX === null ? 0 : Math.min(Math.max(X(activeX), 80), width - 80)

  if (empty) return <div ref={wrap} className="w-full" style={{ height }} />

  return (
    <div ref={wrap} className="relative w-full" tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)} role="group" aria-label={ariaLabel}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} className="block touch-pan-y select-none">
        <rect x={L} y={T} width={pw} height={ph} className="fill-surface" stroke="var(--border-strong)" />
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} stroke="var(--border)" />
            <line x1={L - 6} x2={L} y1={Y(v)} y2={Y(v)} stroke="var(--border-strong)" />
            <text x={L - 10} y={Y(v)} dy="0.32em" textAnchor="end" fontSize={12} className="fill-muted-foreground font-mono">{fmtY(v)}</text>
          </g>
        ))}
        {minorTicks(dom, 4).map((v) => <line key={`m${v}`} x1={L - 3} x2={L} y1={Y(v)} y2={Y(v)} stroke="var(--border-strong)" />)}
        {xTicks.map((v, i) => (
          <g key={`x${v}`}>
            <line x1={X(v)} x2={X(v)} y1={T} y2={T + ph} stroke="var(--border)" />
            <line x1={X(v)} x2={X(v)} y1={T + ph} y2={T + ph + 6} stroke="var(--border-strong)" />
            {i % labelEvery === 0 && <text x={X(v)} y={T + ph + 20} textAnchor="middle" fontSize={12} className="fill-muted-foreground font-mono">{labelOf(v)}</text>}
          </g>
        ))}
        {target && Y(target.value) >= T && Y(target.value) <= T + ph && (
          <g>
            <line x1={L} x2={L + pw} y1={Y(target.value)} y2={Y(target.value)} stroke="var(--warn)" strokeWidth={2} strokeDasharray="6 5" />
            <text x={L + pw - 6} y={Y(target.value) - 6} textAnchor="end" fontSize={12} fontWeight={600} className="fill-warn">{target.label}</text>
          </g>
        )}
        {activeX !== null && <line x1={X(activeX)} x2={X(activeX)} y1={T} y2={T + ph} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3" />}
        {m.pts.map((s, i) => {
          const pts = s.pts.map((p) => [X(p.xv), Y(p.y)] as [number, number])
          const c = colorOf(i)
          return (
            <g key={s.name}>
              {pts.length > 1 && <path d={linePath(pts)} fill="none" stroke={c} strokeWidth={compact ? 2.5 : 3} strokeLinejoin="round" strokeLinecap="round" />}
              {(dots || pts.length === 1) && pts.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={compact ? 3.5 : 4.5} fill={c} stroke="var(--surface)" strokeWidth={1.5} />)}
              {!dots && pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4.5} fill={c} stroke="var(--surface)" strokeWidth={1.5} />}
              {activeX !== null && s.pts.filter((p) => p.xv === activeX).map((p) => <circle key="a" cx={X(p.xv)} cy={Y(p.y)} r={7} fill={c} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          )
        })}
      </svg>
      {tipRows.length > 0 && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 border border-border-strong bg-card px-3 py-2 text-[12px] text-foreground" style={{ left: tipLeft, top: 0 }} role="status">
          <p className="font-semibold">{labelOf(activeX as number)}</p>
          {tipRows.map(({ s, i, p }) => (
            <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2" style={{ background: colorOf(i) }} />
              {m.pts.length > 1 && <span className="text-muted-foreground">{s.name}</span>}
              <span className="font-mono font-semibold">{p?.y}{yUnit}</span>
            </p>
          ))}
          {tipRows[0].p?.note && <p className="max-w-[220px] whitespace-normal text-muted-foreground">{tipRows[0].p.note}</p>}
        </div>
      )}
      {m.pts.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {m.pts.map((s, i) => <span key={s.name} className="flex items-center gap-2"><span className="h-2 w-4" style={{ background: colorOf(i) }} />{s.name}</span>)}
        </div>
      )}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <tbody>
          {m.pts.flatMap((s) => s.pts.map((p) => <tr key={`${s.name}${p.xv}`}><th scope="row">{s.name}</th><td>{labelOf(p.xv)}</td><td>{p.y}{yUnit}</td></tr>))}
        </tbody>
      </table>
    </div>
  )
}

/* Horizontal bar chart */
export function BarChart({ data, unit = '', max: fixedMax }: { data: { label: string; value: number }[]; unit?: string; max?: number }) {
  const max = Math.max(1, fixedMax ?? Math.max(...data.map((d) => d.value))) // `max` tetap (mis. 100 untuk peratus) supaya bar dapat dibandingkan
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[14px] font-medium text-muted-foreground">{tr(d.label)}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
            <div className="flex h-full items-center justify-end rounded-md bg-primary px-2" style={{ width: `${Math.max(8, (d.value / max) * 100)}%` }}>
              <span className="text-[12px] font-bold text-primary-foreground tnum">{d.value}{tr(unit)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* Donut */
export function Donut({ segments, size = 132, label, sub }: { segments: { value: number; color: string }[]; size?: number; label: string; sub?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="12" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="round" />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold text-foreground tnum">{label}</span>
        {sub && <span className="text-[12px] text-muted-foreground">{tr(sub)}</span>}
      </div>
    </div>
  )
}
