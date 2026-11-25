import { useEffect } from 'react'
import { ArrowLeft, Pause, Play, SkipBack } from 'lucide-react'
import { DURATIONS } from '../sim/defaults'
import { useLab, useSnapshot } from '../store/useLab'
import { Checkup } from './Checkup'
import { Panel } from './Properties'
import { Results } from './Results'
import { SimpleControls } from './SimpleControls'
import { usePlayback } from './Timeline'
import { nodeLabel } from './tree'

/**
 * Default editor panel: plain-language controls, with the exact settings one
 * click away (pick a tool on the bench, or a chip at the bottom of the list),
 * plus the results and check-up tabs.
 */
export function MiddleSidebar() {
  const tab = useLab((s) => s.rightTab)
  const setTab = useLab((s) => s.setRightTab)
  const selection = useLab((s) => s.selection)
  const select = useLab((s) => s.select)
  const config = useLab((s) => s.experiment.config)
  const result = useLab((s) => s.result)

  // this layout is live: every change re-runs the plant, and the timeline keeps its place
  useEffect(() => {
    useLab.getState().run()
  }, [config])

  const tabs = [
    ['properties', 'Controls'],
    ['results', 'Results'],
    ['checkup', 'Check-up'],
  ] as const
  return (
    <aside className="flex min-h-0 flex-1 flex-col border-l border-line bg-panel">
      <div role="tablist" className="flex h-[34px] shrink-0 border-b border-line">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`relative flex flex-1 items-center justify-center gap-1.5 text-[12.5px] ${tab === id ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}>
            {label}
            {id === 'results' && result && <span className="num rounded-[4px] bg-forest px-1 text-[10.5px] font-normal text-surface">{result.overall}</span>}
            {tab === id && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-forest" />}
          </button>
        ))}
      </div>
      {tab === 'properties' ? (
        selection ? (
          <>
            <div className="flex h-[38px] shrink-0 items-center gap-2 border-b border-line px-3">
              <button type="button" onClick={() => select(null)} className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] hover:border-forest hover:text-forest">
                <ArrowLeft size={12} /> All settings
              </button>
              <h2 className="truncate text-[15px] font-semibold">{nodeLabel(config, selection)}</h2>
            </div>
            <div className="scroll min-h-0 flex-1" key={selection}>
              <Panel selection={selection} />
            </div>
          </>
        ) : (
          <div className="scroll min-h-0 flex-1">
            <SimpleControls />
          </div>
        )
      ) : tab === 'results' ? (
        <Results />
      ) : (
        <Checkup />
      )}
    </aside>
  )
}

/** One-row timeline: play, scrub, and how far ahead to look. */
export function MiniTimeline() {
  usePlayback()
  const experiment = useLab((s) => s.experiment)
  const result = useLab((s) => s.result)
  const day = useLab((s) => s.day)
  const playing = useLab((s) => s.playing)
  const { setPlaying, setDay, setDuration } = useLab.getState()
  const snap = useSnapshot()
  const max = result?.durationDays ?? experiment.durationDays
  const date = new Date(experiment.createdAt + Math.floor(day) * 86400000)
  return (
    <footer className="flex h-[52px] shrink-0 items-center gap-3 border-t border-line bg-panel px-3">
      <button type="button" title="Back to today" aria-label="Back to today" onClick={() => { setPlaying(false); setDay(0) }} className="grid h-[30px] w-[30px] place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink">
        <SkipBack size={13} />
      </button>
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)} className="flex h-[30px] items-center gap-1.5 rounded-full bg-forest px-3.5 font-medium text-surface hover:bg-forest-deep">
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        {playing ? 'Pause' : 'Play'}
      </button>
      <div className="w-[118px] shrink-0 leading-tight">
        <div className="text-[12.5px] font-semibold">
          Day <span className="num">{Math.floor(day)}</span> <span className="num font-normal text-ink-3">/ {max}</span>
        </div>
        <div className="num text-[10.5px] text-ink-3">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </div>
      <input
        type="range"
        className="slider min-w-0 flex-1"
        aria-label="Simulation day"
        min={0}
        max={max}
        step={1}
        value={Math.round(day)}
        style={{ '--fill': `${(day / max) * 100}%` } as React.CSSProperties}
        onChange={(e) => { setPlaying(false); setDay(parseFloat(e.target.value)) }}
      />
      <span className="num hidden w-[150px] shrink-0 text-right text-[11px] text-ink-2 min-[1200px]:block">
        {snap.alive ? `${Math.round(snap.health)} % health · ${snap.leaves.length} leaves` : 'plant has died'}
      </span>
      <select aria-label="How far ahead" className="select w-[112px] shrink-0" value={experiment.durationDays} onChange={(e) => setDuration(parseInt(e.target.value))}>
        {DURATIONS.map((d) => (
          <option key={d.days} value={d.days}>
            {d.label}
          </option>
        ))}
      </select>
    </footer>
  )
}
