import { useEffect, useMemo, useRef } from 'react'
import { Pause, Play, SkipBack, StepBack, StepForward } from 'lucide-react'
import { DURATIONS } from '../sim/defaults'
import type { SimEvent } from '../sim/types'
import { useLab, useSnapshot } from '../store/useLab'

/** Seconds a full run takes to play back at 1×. */
const PLAY_SECONDS = 16
const SPEEDS = [0.5, 1, 2, 4]

export function usePlayback() {
  const playing = useLab((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const s = useLab.getState()
      const max = s.result?.durationDays ?? 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const next = s.day + (dt * max * s.speed) / PLAY_SECONDS
      if (next >= max) {
        useLab.setState({ day: max, playing: false })
        return
      }
      useLab.setState({ day: next })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}

const EVENT_COLOR: Record<SimEvent['kind'], string> = {
  newLeaf: 'var(--color-forest)',
  leafLost: 'var(--color-amber)',
  stressStart: 'var(--color-rust)',
  death: 'var(--color-ink)',
  milestone: 'var(--color-ink-3)',
}

function Chart() {
  const result = useLab((s) => s.result)
  const stale = useLab((s) => s.stale)
  const day = useLab((s) => s.day)
  const setDay = useLab((s) => s.setDay)
  const setPlaying = useLab((s) => s.setPlaying)
  const ref = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const paths = useMemo(() => {
    if (!result) return null
    const n = result.durationDays
    const line = (get: (i: number) => number) =>
      result.snapshots.map((_, i) => `${i === 0 ? 'M' : 'L'}${((i / n) * 1000).toFixed(1)} ${(100 - Math.min(100, Math.max(0, get(i))) * 0.92 - 4).toFixed(1)}`).join('')
    return {
      health: line((i) => result.snapshots[i].health),
      moisture: line((i) => Math.min(1, result.snapshots[i].moisture) * 100),
      growth: line((i) => result.snapshots[i].growthRate * 100),
    }
  }, [result])

  const scrub = (e: React.PointerEvent) => {
    if (!result) return
    const rect = ref.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setDay(Math.round(f * result.durationDays))
  }

  if (!result || !paths) {
    return (
      <div className="grid h-full place-items-center rounded-[4px] border border-dashed border-line-strong text-[12px] text-ink-3">
        Run the simulation to generate a timeline you can scrub through.
      </div>
    )
  }
  const n = result.durationDays
  const ticks = n <= 7 ? 7 : n <= 30 ? 6 : n <= 90 ? 6 : n <= 180 ? 6 : 12
  return (
    <div className="flex h-full flex-col">
      <div
        ref={ref}
        className={`relative min-h-0 flex-1 cursor-ew-resize touch-none overflow-hidden rounded-[4px] border border-line bg-surface ${stale ? 'opacity-60' : ''}`}
        onPointerDown={(e) => {
          scrubbing.current = true
          setPlaying(false)
          e.currentTarget.setPointerCapture(e.pointerId)
          scrub(e)
        }}
        onPointerMove={(e) => scrubbing.current && scrub(e)}
        onPointerUp={(e) => {
          scrubbing.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {[25, 50, 75].map((y) => (
            <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 4" />
          ))}
          {result.snapshots.map((s) =>
            s.watered && n <= 180 ? <line key={s.day} x1={(s.day / n) * 1000} x2={(s.day / n) * 1000} y1="94" y2="100" stroke="var(--color-water)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.7" /> : null,
          )}
          <path d={paths.moisture} fill="none" stroke="var(--color-water)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.75" />
          <path d={paths.growth} fill="none" stroke="var(--color-clay)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" strokeDasharray="3 2" />
          <path d={paths.health} fill="none" stroke="var(--color-forest)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {result.events
            .filter((e) => e.kind !== 'stressStart')
            .map((e, i) => (
              <line key={i} x1={(e.day / n) * 1000} x2={(e.day / n) * 1000} y1="0" y2={e.kind === 'death' ? 100 : 9} stroke={EVENT_COLOR[e.kind]} strokeWidth={e.kind === 'death' ? 1.5 : 2.5} vectorEffect="non-scaling-stroke" />
            ))}
        </svg>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{ left: `${(day / n) * 100}%` }}>
          <div className="absolute left-[-4px] top-0 h-0 w-0 border-x-[4.5px] border-t-[6px] border-x-transparent border-t-ink" />
        </div>
      </div>
      <div className="relative mt-0.5 h-[14px] shrink-0">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const d = Math.round((i / ticks) * n)
          return (
            <span key={i} className="num absolute text-[10px] text-ink-3" style={{ left: `${(i / ticks) * 100}%`, transform: i === 0 ? 'none' : i === ticks ? 'translateX(-100%)' : 'translateX(-50%)' }}>
              {i === 0 ? 'day 0' : d}
            </span>
          )
        })}
      </div>
      <input
        type="range"
        className="slider shrink-0"
        aria-label="Simulation day"
        min={0}
        max={n}
        step={1}
        value={Math.round(day)}
        style={{ '--fill': `${(day / n) * 100}%` } as React.CSSProperties}
        onChange={(e) => {
          setPlaying(false)
          setDay(parseFloat(e.target.value))
        }}
      />
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10.5px] text-ink-3">
      {[
        ['Health', 'var(--color-forest)', false],
        ['Moisture', 'var(--color-water)', false],
        ['Growth rate', 'var(--color-clay)', true],
      ].map(([label, color, dashed]) => (
        <span key={label as string} className="flex items-center gap-1">
          <span className="inline-block w-3 border-t-2" style={{ borderColor: color as string, borderStyle: dashed ? 'dashed' : 'solid' }} />
          {label}
        </span>
      ))}
    </div>
  )
}

export function Timeline() {
  usePlayback()
  const experiment = useLab((s) => s.experiment)
  const result = useLab((s) => s.result)
  const day = useLab((s) => s.day)
  const playing = useLab((s) => s.playing)
  const speed = useLab((s) => s.speed)
  const { setPlaying, setDay, setSpeed, setDuration } = useLab.getState()
  const snap = useSnapshot()
  const whole = Math.floor(day)
  const date = new Date(experiment.createdAt + whole * 86400000)
  const events = result?.events ?? []
  // the most recent event at or before the playhead
  let currentEvent = -1
  for (let i = 0; i < events.length; i++) if (events[i].day <= whole) currentEvent = i

  return (
    <footer className="col-span-3 grid min-h-0 grid-cols-[232px_minmax(0,1fr)_340px] border-t border-line bg-panel max-[1320px]:grid-cols-[208px_minmax(0,1fr)_300px]">
      {/* transport */}
      <div className="flex min-h-0 flex-col gap-2 border-r border-line px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button type="button" title="Reset to day 0" aria-label="Reset to day 0" onClick={() => { setPlaying(false); setDay(0) }} className="grid h-[28px] w-[28px] place-items-center rounded-[4px] border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink">
            <SkipBack size={13} />
          </button>
          <button type="button" title="Back one day" aria-label="Back one day" disabled={!result} onClick={() => { setPlaying(false); setDay(whole - 1) }} className="grid h-[28px] w-[28px] place-items-center rounded-[4px] border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40">
            <StepBack size={13} />
          </button>
          <button
            type="button"
            title={playing ? 'Pause (space)' : 'Play (space)'}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying(!playing)}
            className="flex h-[28px] flex-1 items-center justify-center gap-1.5 rounded-[4px] bg-ink font-medium text-surface hover:bg-forest-deep"
          >
            {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" title="Forward one day" aria-label="Forward one day" disabled={!result} onClick={() => { setPlaying(false); setDay(whole + 1) }} className="grid h-[28px] w-[28px] place-items-center rounded-[4px] border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40">
            <StepForward size={13} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <select aria-label="Simulation duration" className="select min-w-0 flex-1" value={experiment.durationDays} onChange={(e) => setDuration(parseInt(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.days} value={d.days}>
                {d.label}
              </option>
            ))}
          </select>
          <select aria-label="Playback speed" className="select w-[62px]" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
        <div className="mt-auto">
          <div className="flex items-baseline justify-between">
            <span>
              <span className="label-caps">Day </span>
              <span className="num text-[18px] font-medium">{whole}</span>
              <span className="num text-[11px] text-ink-3"> / {result?.durationDays ?? experiment.durationDays}</span>
            </span>
            <span className="num text-[11px] text-ink-2">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="num mt-0.5 flex justify-between whitespace-nowrap text-[10.5px] text-ink-3">
            <span>health {snap.alive ? Math.round(snap.health) : '—'}</span>
            <span>{snap.leaves.length} leaves</span>
            <span>moist. {Math.round(Math.min(1.5, snap.moisture) * 100)}%</span>
          </div>
        </div>
      </div>

      {/* chart + scrubber */}
      <div className="flex min-h-0 min-w-0 flex-col px-3 pb-2 pt-1.5">
        <div className="mb-1 flex shrink-0 items-center justify-between">
          <span className="label-caps">Simulation timeline</span>
          <Legend />
        </div>
        <div className="min-h-0 flex-1">
          <Chart />
        </div>
      </div>

      {/* event history */}
      <div className="flex min-h-0 flex-col border-l border-line">
        <div className="label-caps shrink-0 px-3 pb-1 pt-2">History</div>
        <ol className="scroll min-h-0 flex-1 pb-1">
          {events.length === 0 && <li className="px-3 text-[11.5px] text-ink-3">{result ? 'No notable events in this run.' : 'Events appear here after a run.'}</li>}
          {events.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => { setPlaying(false); setDay(e.day) }}
                ref={i === currentEvent && playing ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                className={`flex w-full items-center gap-2 px-3 py-[3px] text-left hover:bg-sunken ${i === currentEvent ? 'bg-sunken' : ''} ${e.day > whole ? 'text-ink-3' : ''}`}
              >
                <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: EVENT_COLOR[e.kind] }} />
                <span className="num w-[26px] shrink-0 text-right text-[11px] text-ink-3">{e.day}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{e.message}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </footer>
  )
}
