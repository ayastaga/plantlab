import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { FACTOR_LABELS, runSimulation } from '../sim/engine'
import { describeConfig } from '../sim/recommend'
import type { Experiment, FactorKey } from '../sim/types'
import { useLab } from '../store/useLab'
import { ScoreBar } from './controls/controls'

const MAX = 4

export function Compare() {
  const open = useLab((s) => s.compareOpen)
  const setOpen = useLab((s) => s.setCompareOpen)
  const current = useLab((s) => s.experiment)
  const saved = useLab((s) => s.saved)
  const dirty = useLab((s) => s.dirty)
  const load = useLab((s) => s.load)
  const [picked, setPicked] = useState<string[]>([])
  const [onlyDiff, setOnlyDiff] = useState(true)

  // the working experiment (as it is now) plus everything saved under another id
  const pool = useMemo<(Experiment & { tag?: string })[]>(() => {
    const others = saved.filter((e) => e.id !== current.id)
    return [{ ...current, tag: dirty ? 'current, unsaved' : 'current' }, ...others]
  }, [current, saved, dirty])

  useEffect(() => {
    if (open) setPicked(pool.slice(0, Math.min(3, pool.length)).map((e) => e.id))
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const columns = useMemo(
    () =>
      pool
        .filter((e) => picked.includes(e.id))
        .map((e) => ({ exp: e, result: runSimulation(e.config, current.durationDays), rows: describeConfig(e.config) })),
    [pool, picked, current.durationDays],
  )

  if (!open) return null
  const rowKeys = columns[0]?.rows ?? []
  const differs = (key: string) => new Set(columns.map((c) => c.rows.find((r) => r.key === key)?.value)).size > 1
  const changed = rowKeys.filter((r) => differs(r.key))
  const best = columns.reduce((m, c) => Math.max(m, c.result.overall), 0)

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(34,39,31,0.35)] p-6" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-label="Compare experiments" className="rise flex max-h-full w-full max-w-[1040px] flex-col rounded-[6px] border border-line-strong bg-panel shadow-[0_18px_60px_rgba(34,39,31,0.25)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
          <h2 className="font-semibold text-[21px] leading-none">Compare experiments</h2>
          <span className="num text-[11px] text-ink-3">each simulated for {current.durationDays} days</span>
          <div className="flex-1" />
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid h-6 w-6 place-items-center rounded-[4px] text-ink-2 hover:bg-sunken">
            <X size={15} />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
          <span className="label-caps mr-1">Include</span>
          {pool.map((e) => {
            const on = picked.includes(e.id)
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={on}
                disabled={!on && picked.length >= MAX}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                className={`rounded-[4px] border px-2 py-0.5 disabled:opacity-40 ${on ? 'border-forest bg-forest-soft' : 'border-line bg-surface hover:border-line-strong'}`}
              >
                {e.name}
                {e.tag && <span className="ml-1 text-[10.5px] text-ink-3">({e.tag})</span>}
              </button>
            )
          })}
          {pool.length < 2 && <span className="text-[11.5px] text-ink-3">Save this experiment, duplicate it, change a variable and save again to compare versions.</span>}
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-[var(--color-forest)]" />
            Only show differences
          </label>
        </div>

        <div className="scroll min-h-0 flex-1">
          {columns.length === 0 ? (
            <p className="p-8 text-center text-ink-3">Pick at least one experiment.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr>
                  <th className="w-[150px] border-b border-line px-4 py-2" />
                  {columns.map((c) => (
                    <th key={c.exp.id} className="border-b border-l border-line px-3 py-2 align-top font-normal">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.exp.name}</div>
                          <div className="font-semibold text-[16px] leading-tight">{c.result.verdict}</div>
                        </div>
                        <div className={`num shrink-0 rounded-[4px] px-1.5 text-[18px] font-medium ${c.result.overall === best && columns.length > 1 ? 'bg-forest text-surface' : 'bg-sunken'}`}>{c.result.overall}</div>
                      </div>
                      {c.exp.id !== current.id && (
                        <button type="button" onClick={() => { load(c.exp.id); setOpen(false) }} className="mt-1 text-[11px] text-forest underline-offset-2 hover:underline">
                          Open this experiment
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={columns.length + 1} className="label-caps bg-sunken px-4 py-1">
                    Outcome
                  </td>
                </tr>
                {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((k) => (
                  <tr key={k}>
                    <td className="border-b border-line px-4 py-1.5 text-ink-2">{FACTOR_LABELS[k]}</td>
                    {columns.map((c) => (
                      <td key={c.exp.id} className="border-b border-l border-line px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="num w-6 text-right">{c.result.scores[k]}</span>
                          <ScoreBar value={c.result.scores[k]} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
                {(
                  [
                    ['Leaves grown / lost', (c: (typeof columns)[number]) => `+${c.result.growth.leavesGrown} / −${c.result.growth.leavesLost}`],
                    ['Health at end', (c: (typeof columns)[number]) => (c.result.growth.survived ? `${c.result.growth.finalHealth} %` : `died day ${c.result.growth.daysToDeath}`)],
                    ['Growth potential', (c: (typeof columns)[number]) => `${c.result.growth.potentialPct} %`],
                    ['Most limiting', (c: (typeof columns)[number]) => FACTOR_LABELS[c.result.limitingFactor]],
                  ] as const
                ).map(([label, get]) => (
                  <tr key={label}>
                    <td className="border-b border-line px-4 py-1.5 text-ink-2">{label}</td>
                    {columns.map((c) => (
                      <td key={c.exp.id} className="num border-b border-l border-line px-3 py-1.5 text-[12px]">
                        {get(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={columns.length + 1} className="label-caps bg-sunken px-4 py-1">
                    Conditions {columns.length > 1 && `· ${changed.length} ${changed.length === 1 ? 'variable differs' : 'variables differ'}`}
                  </td>
                </tr>
                {rowKeys
                  .filter((r) => !onlyDiff || columns.length < 2 || differs(r.key))
                  .map((r) => {
                    const diff = columns.length > 1 && differs(r.key)
                    return (
                      <tr key={r.key} className={diff ? 'bg-[#f6efdc]' : ''}>
                        <td className="border-b border-line px-4 py-1.5 text-ink-2">
                          <span className="text-ink-3">{r.group} · </span>
                          {r.label}
                        </td>
                        {columns.map((c) => (
                          <td key={c.exp.id} className={`num border-b border-l border-line px-3 py-1.5 text-[12px] ${diff ? 'font-medium' : ''}`}>
                            {c.rows.find((x) => x.key === r.key)?.value}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                {onlyDiff && columns.length > 1 && changed.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-3 text-ink-3">
                      These experiments have identical conditions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
