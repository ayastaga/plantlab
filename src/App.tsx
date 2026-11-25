import { useEffect } from 'react'
import { Viewport } from './scene/Viewport'
import { useLab, useSnapshot } from './store/useLab'
import { Compare } from './ui/Compare'
import { Backdrop } from './scene/Backdrop'
import { Garden } from './ui/Garden'
import { MiddleSidebar, MiniTimeline } from './ui/MiddleLayout'
import { Hierarchy } from './ui/Hierarchy'
import { RightSidebar } from './ui/Properties'
import { Timeline } from './ui/Timeline'
import { Toolbar } from './ui/Toolbar'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useLab.getState()
      if (s.screen !== 'lab') return
      const typing = e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing && (e.target as HTMLInputElement).type !== 'range') return
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        s.save()
      } else if (mod && e.key === 'Enter') {
        e.preventDefault()
        s.run()
        s.setRightTab('results')
      } else if (e.key === ' ' && !typing && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'Escape' && !typing && !s.compareOpen) {
        s.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Live read-outs over the viewport: the measured quantities behind what is drawn. */
function ViewportOverlay() {
  const snap = useSnapshot()
  const day = useLab((s) => s.day)
  const hasResult = useLab((s) => s.result !== null)
  const requestCamera = useLab((s) => s.requestCamera)
  const chips: [string, string][] = [
    ['DLI', `${snap.env.dli.toFixed(1)}`],
    ['RH', `${Math.round(snap.env.rh)} %`],
    ['Temp', `${snap.env.tMeanC.toFixed(1)} °C`],
    ['VPD', `${snap.env.vpdKpa.toFixed(2)} kPa`],
    ['Moisture', `${Math.round(Math.min(1.5, snap.moisture) * 100)} %`],
  ]
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-surface">Lab</span>
          <span className="num rounded-[3px] bg-surface/85 px-1.5 py-0.5 text-[11px] text-ink-2 backdrop-blur-sm">{hasResult ? `day ${Math.floor(day)}` : 'not simulated yet'}</span>
          {!snap.alive && <span className="rounded-[3px] bg-rust px-1.5 py-0.5 text-[11px] font-medium text-surface">Plant has died</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {chips.map(([k, v]) => (
            <span key={k} className="rounded-[3px] bg-surface/85 px-1.5 py-0.5 text-[11px] backdrop-blur-sm">
              <span className="text-ink-3">{k} </span>
              <span className="num">{v}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-[4px] border border-line bg-surface/90 backdrop-blur-sm">
        {(['iso', 'front', 'side', 'top'] as const).map((p) => (
          <button key={p} type="button" onClick={() => requestCamera(p)} title={`${p === 'iso' ? 'Three-quarter' : p[0].toUpperCase() + p.slice(1)} view`} className="border-r border-line px-2 py-1 text-[11px] capitalize text-ink-2 last:border-0 hover:bg-sunken hover:text-ink">
            {p === 'iso' ? '3/4' : p}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-ink-3">Drag to orbit · scroll to zoom · right-drag to pan · click an object to edit it · drag the sun to move it</div>
    </>
  )
}

export default function App() {
  useShortcuts()
  const screen = useLab((s) => s.screen)
  const advanced = useLab((s) => s.view.advanced)
  return (
    <div className="grid h-full min-w-[1080px] grid-cols-[232px_minmax(0,1fr)_340px] grid-rows-[42px_minmax(0,1fr)_168px] max-[1320px]:grid-cols-[208px_minmax(0,1fr)_300px]">
      <Toolbar />
      {screen === 'garden' ? (
        <Garden />
      ) : advanced ? (
        <>
          <Hierarchy />
          <main className="relative min-h-0 min-w-0">
            <Backdrop />
            <Viewport />
            <ViewportOverlay />
          </main>
          <RightSidebar />
          <Timeline />
        </>
      ) : (
        <div className="col-span-3 row-span-2 grid min-h-0 grid-cols-[minmax(0,1fr)_372px] grid-rows-[minmax(0,1fr)_auto]">
          <main className="relative min-h-0 min-w-0">
            <Backdrop />
            <Viewport />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface/85 px-2.5 py-0.5 text-[11px] text-ink-2">Click a tool on the bench to change its setting · drag to look around · drag the sun to move it</div>
          </main>
          <div className="row-span-2 flex min-h-0 flex-col">
            <MiddleSidebar />
          </div>
          <MiniTimeline />
        </div>
      )}
      <Compare />
    </div>
  )
}
