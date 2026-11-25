import { useRef } from 'react'

const W = 132
const H = 190
const TOP = 12
const BOTTOM = 158
const X = 46
const MIN = 0
const MAX = 42

const yFor = (t: number) => BOTTOM - ((Math.min(MAX, Math.max(MIN, t)) - MIN) / (MAX - MIN)) * (BOTTOM - TOP)
const tFor = (y: number) => MIN + ((BOTTOM - Math.min(BOTTOM, Math.max(TOP, y))) / (BOTTOM - TOP)) * (MAX - MIN)

type Handle = 'mean' | 'min' | 'max'

/**
 * Thermometer control. Drag the column for the mean, or the side markers for
 * the night low and day high. The green band is the species' preferred range.
 */
export function Thermometer({
  mean,
  min,
  max,
  optLow,
  optHigh,
  damageBelow,
  onChange,
}: {
  mean: number
  min: number
  max: number
  optLow: number
  optHigh: number
  damageBelow: number
  onChange: (handle: Handle, value: number) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const active = useRef<Handle | null>(null)

  const move = (e: React.PointerEvent) => {
    if (!active.current) return
    const rect = ref.current!.getBoundingClientRect()
    const y = ((e.clientY - rect.top) / rect.height) * H
    onChange(active.current, Math.round(tFor(y) * 2) / 2)
  }
  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    active.current = handle
    ref.current!.setPointerCapture(e.pointerId)
    move(e)
  }

  const hot = Math.min(1, Math.max(0, (mean - 10) / 22))
  const mercury = `color-mix(in srgb, #c8452f ${Math.round(hot * 100)}%, #3f7fb5)`

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="block shrink-0 touch-none"
      role="img"
      aria-label={`Temperature: mean ${mean} °C, low ${min} °C, high ${max} °C`}
      onPointerMove={move}
      onPointerUp={(e) => {
        active.current = null
        ref.current!.releasePointerCapture(e.pointerId)
      }}
    >
      {/* preferred band and chilling zone */}
      <rect x={X - 13} y={yFor(optHigh)} width={26} height={yFor(optLow) - yFor(optHigh)} fill="var(--color-forest-soft)" />
      <rect x={X - 13} y={yFor(damageBelow)} width={26} height={BOTTOM - yFor(damageBelow)} fill="#dbe6ee" />
      {/* tube */}
      <rect x={X - 6} y={TOP - 6} width={12} height={BOTTOM - TOP + 12} rx={6} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
      <circle cx={X} cy={BOTTOM + 14} r={12} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
      <circle cx={X} cy={BOTTOM + 14} r={8.5} fill={mercury} />
      <rect x={X - 3} y={yFor(mean)} width={6} height={BOTTOM + 8 - yFor(mean)} fill={mercury} />
      {/* daily range bracket */}
      <line x1={X} y1={yFor(max)} x2={X} y2={yFor(min)} stroke="var(--color-ink)" strokeWidth="1" opacity="0.25" />
      {/* scale */}
      {Array.from({ length: 9 }, (_, i) => i * 5).map((t) => (
        <g key={t}>
          <line x1={X + 9} y1={yFor(t)} x2={X + (t % 10 === 0 ? 16 : 13)} y2={yFor(t)} stroke="var(--color-ink-3)" />
          {t % 10 === 0 && (
            <text x={X + 19} y={yFor(t) + 3} fontSize="8.5" fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
              {t}°
            </text>
          )}
        </g>
      ))}
      {/* grab area for the mean */}
      <rect x={X - 10} y={TOP - 6} width={20} height={BOTTOM - TOP + 12} fill="transparent" className="cursor-ns-resize" onPointerDown={start('mean')} />
      <circle cx={X} cy={yFor(mean)} r={5} fill="var(--color-surface)" stroke={mercury} strokeWidth="2" className="cursor-ns-resize" onPointerDown={start('mean')} />
      {/* min / max markers */}
      {(
        [
          ['max', max, 'High'],
          ['min', min, 'Low'],
        ] as const
      ).map(([handle, value, label]) => (
        <g key={handle} className="cursor-ns-resize" onPointerDown={start(handle)}>
          <path d={`M${X - 9} ${yFor(value)}l-8 -5v10z`} fill="var(--color-ink-2)" />
          <rect x={0} y={yFor(value) - 8} width={X - 8} height={16} fill="transparent" />
          <text x={X - 20} y={yFor(value) + 3} fontSize="8.5" textAnchor="end" fill="var(--color-ink-2)" fontFamily="var(--font-sans)">
            {label}
          </text>
        </g>
      ))}
      <text x={X + 38} y={yFor((optLow + optHigh) / 2) + 3} fontSize="8" fill="var(--color-forest)" fontFamily="var(--font-sans)">
        preferred
      </text>
    </svg>
  )
}
