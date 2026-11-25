import { useEffect, useRef } from 'react'

/**
 * Flat 2D backdrop drawn behind the (transparent) 3D canvas: a clear
 * golden-hour sky, dusty blue overhead falling to peach, with the glow of a
 * low sun and a little film grain. No clouds.
 */
const SUN = { x: 0.2, y: 0.78 }

function paint(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  // dusty blue overhead falling to peach at the horizon
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#5578b8')
  sky.addColorStop(0.42, '#8ea4d2')
  sky.addColorStop(0.72, '#e9c3ae')
  sky.addColorStop(1, '#ffd9a6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  // low sun glow
  const glow = ctx.createRadialGradient(w * SUN.x, h * SUN.y, 0, w * SUN.x, h * SUN.y, h * 0.75)
  glow.addColorStop(0, 'rgba(255,236,190,0.75)')
  glow.addColorStop(0.35, 'rgba(255,214,160,0.28)')
  glow.addColorStop(1, 'rgba(255,214,160,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      canvas.width = Math.round(rect.width)
      canvas.height = Math.round(rect.height)
      paint(canvas)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: GRAIN, opacity: 0.45 }} />
    </div>
  )
}
