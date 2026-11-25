import { useRef } from 'react'

const SIZE = 168
const R = 62
const C = SIZE / 2

/**
 * Top-down sky dome. The plant is at the centre; drag the sun around it.
 * Angle = azimuth, distance from centre = how low the sun is (centre is overhead).
 */
export function SunDial({
  azimuth,
  elevation,
  color,
  onChange,
}: {
  azimuth: number
  elevation: number
  color: string
  onChange: (azimuth: number, elevation: number) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const az = (azimuth * Math.PI) / 180
  const dist = ((90 - elevation) / 90) * R
  // scene +X is right, scene +Z is toward the viewer (down on the dial)
  const x = C + Math.sin(az) * dist
  const y = C + Math.cos(az) * dist

  const fromPointer = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * SIZE - C
    const py = ((e.clientY - rect.top) / rect.height) * SIZE - C
    const d = Math.min(R, Math.hypot(px, py))
    const a = (Math.atan2(px, py) * 180) / Math.PI
    onChange(Math.round((a + 360) % 360), Math.round(Math.max(5, 90 - (d / R) * 90)))
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label={`Sun position: azimuth ${azimuth}°, elevation ${elevation}°`}
      className="mx-auto block cursor-crosshair touch-none"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        fromPointer(e)
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
    >
      <circle cx={C} cy={C} r={R} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
      {[30, 60].map((el) => (
        <circle key={el} cx={C} cy={C} r={((90 - el) / 90) * R} fill="none" stroke="var(--color-line)" strokeDasharray="2 3" />
      ))}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="var(--color-line)" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="var(--color-line)" />
      {[
        ['0°', C, C + R + 9],
        ['90°', C + R + 9, C + 3],
        ['180°', C, C - R - 3.5],
        ['270°', C - R - 11, C + 3],
      ].map(([t, tx, ty]) => (
        <text key={t} x={tx} y={ty} textAnchor="middle" fontSize="7.5" fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
          {t}
        </text>
      ))}
      {/* plant marker */}
      <path d={`M${C} ${C + 5}v-9M${C} ${C - 1}c0-4 2-6 6-6 0 4-2 6-6 6ZM${C} ${C + 1}c0-3-2-5-5-5 0 3 2 5 5 5Z`} fill="none" stroke="var(--color-forest)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1={C} y1={C} x2={x} y2={y} stroke="var(--color-amber)" strokeDasharray="3 2.5" opacity="0.7" />
      <circle cx={x} cy={y} r="11" fill="#f2c14e" opacity="0.25" />
      <circle cx={x} cy={y} r="6.5" fill={color} stroke="var(--color-amber)" strokeWidth="1.5" />
    </svg>
  )
}
