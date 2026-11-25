import { useEffect, useState } from 'react'
import { Check, Columns3, Copy, FolderOpen, LayoutGrid, Play, Redo2, Save, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react'
import { useLab, type ViewSettings } from '../store/useLab'
import { Menu } from './controls/controls'

function ToolButton({ icon: Icon, label, onClick, disabled, shortcut, active }: { icon: typeof Save; label: string; onClick: () => void; disabled?: boolean; shortcut?: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent ${active ? 'bg-sunken text-ink' : ''}`}
    >
      <Icon size={14} strokeWidth={1.75} />
      <span className="hidden min-[1180px]:inline">{label}</span>
    </button>
  )
}

const Divider = () => <span className="mx-1 h-4 w-px bg-line" />

const VIEW_TOGGLES: { key: keyof ViewSettings; label: string; hint: string }[] = [
  { key: 'grid', label: 'Floor grid', hint: '10 cm cells' },
  { key: 'shadows', label: 'Shadows', hint: 'cast by the sun' },
  { key: 'atmosphere', label: 'Humidity mist', hint: 'visual feedback for RH' },
  { key: 'props', label: 'Instruments', hint: 'thermometer, humidifier, watering can' },
  { key: 'autoRotate', label: 'Turntable', hint: 'slowly orbit the plant' },
  { key: 'liveSim', label: 'Live re-simulation', hint: 're-run automatically after every change' },
]

export function Toolbar() {
  const experiment = useLab((s) => s.experiment)
  const dirty = useLab((s) => s.dirty)
  const saved = useLab((s) => s.saved)
  const canUndo = useLab((s) => s.past.length > 0)
  const canRedo = useLab((s) => s.future.length > 0)
  const view = useLab((s) => s.view)
  const stale = useLab((s) => s.stale)
  const hasResult = useLab((s) => s.result !== null)
  const screen = useLab((s) => s.screen)
  const a = useLab.getState()
  const [name, setName] = useState(experiment.name)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => setName(experiment.name), [experiment.name, experiment.id])

  const save = () => {
    a.save()
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1400)
  }
  const run = () => {
    a.run()
    a.setRightTab('results')
  }

  return (
    <header className="col-span-3 flex h-[42px] items-center gap-1 border-b border-line bg-panel px-2.5">
      <div className="mr-2 flex items-center gap-2 pl-0.5">
        <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="6" fill="var(--color-forest)" />
          <path d="M16 26V14M16 14c0-5 3-8 8-8 0 5-3 8-8 8ZM16 18c0-4-2.500-6.500-7-6.500 0 4 2.500 6.500 7 6.500Z" fill="none" stroke="#f6f4ef" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-semibold text-[19px] leading-none">Plant Lab</span>
      </div>
      <Divider />
      <ToolButton icon={LayoutGrid} label="My plants" onClick={() => a.setScreen('garden')} active={screen === 'garden'} />
      {screen === 'lab' && (
        <>
      <Divider />
      <div className="flex items-center gap-1.5">
        <input
          aria-label="Experiment name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? a.renameExperiment(name) : setName(experiment.name))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-[26px] w-[200px] rounded-[4px] border border-transparent bg-transparent px-2 font-medium hover:border-line focus:border-forest focus:bg-surface"
          style={{ userSelect: 'text' }}
        />
        <span className={`h-[6px] w-[6px] rounded-full ${dirty ? 'bg-amber' : 'bg-transparent'}`} title={dirty ? 'Unsaved changes' : undefined} />
      </div>
      {view.advanced && (
        <>
      <Divider />
      <Menu
        width={280}
        trigger={(open, toggle) => <ToolButton icon={FolderOpen} label="Open" onClick={toggle} active={open} />}
      >
        {(close) => (
          <div>
            <div className="label-caps px-3 py-1.5">Saved experiments</div>
            {saved.length === 0 && <p className="px-3 pb-2 text-[12px] text-ink-3">Nothing saved yet. Save stores the experiment in this browser.</p>}
            <div className="scroll max-h-[280px]">
              {saved.map((e) => (
                <div key={e.id} className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-sunken ${e.id === experiment.id ? 'bg-forest-soft' : ''}`}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      a.load(e.id)
                      close()
                    }}
                  >
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="num block text-[10.5px] text-ink-3">{new Date(e.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${e.name}`} title="Delete" onClick={() => a.deleteSaved(e.id)} className="grid h-5 w-5 place-items-center rounded-[3px] text-ink-3 opacity-0 hover:text-rust group-hover:opacity-100">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Menu>
      <ToolButton icon={justSaved ? Check : Save} label={justSaved ? 'Saved' : 'Save'} onClick={save} shortcut="⌘S" />
      <ToolButton icon={Copy} label="Duplicate" onClick={a.duplicate} />
      <Divider />
      <ToolButton icon={Undo2} label="Undo" onClick={a.undo} disabled={!canUndo} shortcut="⌘Z" />
      <ToolButton icon={Redo2} label="Redo" onClick={a.redo} disabled={!canRedo} shortcut="⇧⌘Z" />
      <Divider />
      <Menu width={250} trigger={(open, toggle) => <ToolButton icon={SlidersHorizontal} label="View" onClick={toggle} active={open} />}>
        {() => (
          <div>
            <div className="label-caps px-3 py-1.5">Camera</div>
            <div className="flex gap-1 px-3 pb-2">
              {(['iso', 'front', 'side', 'top'] as const).map((p) => (
                <button key={p} type="button" onClick={() => a.requestCamera(p)} className="flex-1 rounded-[3px] border border-line bg-surface py-1 capitalize hover:border-forest hover:text-forest">
                  {p === 'iso' ? '3/4' : p}
                </button>
              ))}
            </div>
            <div className="label-caps border-t border-line px-3 py-1.5">Display</div>
            {VIEW_TOGGLES.map((t) => (
              <button key={t.key} type="button" role="menuitemcheckbox" aria-checked={view[t.key]} onClick={() => a.setView({ [t.key]: !view[t.key] })} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sunken">
                <span className={`grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[3px] border ${view[t.key] ? 'border-forest bg-forest text-surface' : 'border-line-strong'}`}>{view[t.key] && <Check size={10} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{t.label}</span>
                  <span className="block text-[10.5px] leading-tight text-ink-3">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Menu>
      <ToolButton icon={Columns3} label="Compare" onClick={() => a.setCompareOpen(true)} />
        </>
      )}
      <div className="flex-1" />
      <div role="radiogroup" aria-label="Editor mode" className="mr-2 flex rounded-full bg-sunken p-[3px]">
        {([true, false] as const).map((adv) => (
          <button key={String(adv)} type="button" role="radio" aria-checked={view.advanced === adv} onClick={() => a.setView({ advanced: adv })} className={`rounded-full px-3 py-0.5 text-[12px] ${view.advanced === adv ? 'bg-surface font-semibold shadow-[0_0_0_1px_var(--color-line-strong)]' : 'text-ink-2 hover:text-ink'}`}>
            {adv ? 'Workstation' : 'Guided'}
          </button>
        ))}
      </div>
      {view.advanced && (
        <>
      {hasResult && stale && <span className="mr-2 hidden text-[11.5px] text-amber min-[1100px]:inline">Conditions changed</span>}
      <button type="button" onClick={run} title="Run simulation (⌘↵)" className="flex h-[28px] items-center gap-1.5 rounded-[4px] bg-forest px-3 font-medium text-surface hover:bg-forest-deep">
        <Play size={12} fill="currentColor" />
        {hasResult && stale ? 'Re-run simulation' : 'Run simulation'}
      </button>
        </>
      )}
        </>
      )}
    </header>
  )
}
