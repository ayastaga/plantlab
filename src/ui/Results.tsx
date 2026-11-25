import { useMemo } from 'react'
import { ArrowUpRight, Check, Play, TriangleAlert } from 'lucide-react'
import { FACTOR_LABELS, FACTOR_WEIGHTS } from '../sim/engine'
import { explain } from '../sim/recommend'
import type { FactorKey } from '../sim/types'
import { useLab } from '../store/useLab'
import { Readout, ScoreBar, Section } from './controls/controls'

const FACTOR_TARGET: Record<FactorKey, string> = {
  light: 'sun',
  water: 'watering',
  humidity: 'atmosphere',
  temperature: 'temperature',
  medium: 'medium',
}

const scoreColor = (v: number) => (v >= 75 ? 'var(--color-forest)' : v >= 55 ? 'var(--color-amber)' : 'var(--color-rust)')

function ScoreDial({ value }: { value: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Compatibility score ${value} out of 100`} className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={scoreColor(value)}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="44" y="47" textAnchor="middle" fontSize="24" fontFamily="var(--font-mono)" fontWeight="500" fill="var(--color-ink)">
        {value}
      </text>
      <text x="44" y="60" textAnchor="middle" fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
        / 100
      </text>
    </svg>
  )
}

export function Results() {
  const result = useLab((s) => s.result)
  const stale = useLab((s) => s.stale)
  const recommendations = useLab((s) => s.recommendations)
  const config = useLab((s) => s.experiment.config)
  const run = useLab((s) => s.run)
  const select = useLab((s) => s.select)
  const apply = useLab((s) => s.applyRecommendation)
  const setDay = useLab((s) => s.setDay)
  // explanations describe the run they came from, so they are only rebuilt when a new result arrives
  const explanation = useMemo(() => (result ? explain(config, result) : null), [result])

  if (!result || !explanation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="font-semibold text-[22px] leading-tight">No simulation yet</p>
        <p className="text-[12px] leading-snug text-ink-2">Run the simulation to estimate how this plant would fare in the conditions you have set.</p>
        <button type="button" onClick={run} className="flex items-center gap-1.5 rounded-[4px] bg-forest px-3 py-1.5 font-medium text-surface hover:bg-forest-deep">
          <Play size={12} fill="currentColor" /> Run simulation
        </button>
      </div>
    )
  }

  const g = result.growth
  return (
    <div className="scroll min-h-0 flex-1">
      {stale && (
        <div className="flex items-center gap-2 border-b border-[#e2d3ab] bg-[#f3ead6] px-3 py-2 text-[#5e4712]">
          <TriangleAlert size={13} className="shrink-0" />
          <span className="flex-1 leading-snug">Conditions changed since this run.</span>
          <button type="button" onClick={run} className="rounded-[3px] border border-[#c9b06a] bg-surface px-2 py-0.5 font-medium hover:border-amber">
            Re-run
          </button>
        </div>
      )}

      <section className={`border-b border-line px-3 py-3 ${stale ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-3">
          <ScoreDial value={result.overall} />
          <div className="min-w-0">
            <div className="label-caps">Verdict · {result.durationDays} days</div>
            <div className="mt-0.5 font-semibold text-[23px] leading-[1.05]">{result.verdict}</div>
          </div>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-snug">{explanation.headline}</p>
        <p className="mt-1 text-[12px] font-medium leading-snug" style={{ color: scoreColor(result.scores[result.limitingFactor]) }}>
          {explanation.limiting}
        </p>
      </section>

      <Section title="Score breakdown">
        {(Object.keys(result.scores) as FactorKey[]).map((k) => (
          <button key={k} type="button" onClick={() => select(FACTOR_TARGET[k])} title={`Edit ${FACTOR_LABELS[k].toLowerCase()}`} className="group text-left">
            <div className="mb-1 flex items-baseline justify-between">
              <span className={`group-hover:text-forest ${k === result.limitingFactor && result.scores[k] < 85 ? 'font-medium' : 'text-ink-2'}`}>
                {FACTOR_LABELS[k]}
                {k === result.limitingFactor && result.scores[k] < 85 && <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">limiting</span>}
              </span>
              <span className="num text-[12px]">{result.scores[k]}</span>
            </div>
            <ScoreBar value={result.scores[k]} />
          </button>
        ))}
        <p className="text-[11px] leading-snug text-ink-3">
          Overall = 70 % conditions ({result.conditionsScore}) + 30 % mean simulated health ({result.meanHealth}). Conditions weigh the weakest factor as heavily as all factors combined (light {FACTOR_WEIGHTS.light * 100}, water {FACTOR_WEIGHTS.water * 100}, temperature{' '}
          {FACTOR_WEIGHTS.temperature * 100}, medium {FACTOR_WEIGHTS.medium * 100}, humidity {FACTOR_WEIGHTS.humidity * 100}).
        </p>
      </Section>

      <Section title="Recommended changes">
        {recommendations.length === 0 && (
          <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-2">
            <Check size={13} className="mt-0.5 shrink-0 text-forest" />
            {result.overall >= 85 ? 'No tested change improves on these conditions.' : 'None of the single changes tested improves the score. Several factors may need to change together.'}
          </p>
        )}
        {recommendations.map((r, i) => (
          <div key={r.id} className="rounded-[4px] border border-line bg-surface p-2.5">
            <div className="flex items-start gap-2">
              <span className="num mt-px text-[11px] text-ink-3">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug">{r.title}</div>
                <div className="label-caps mt-0.5 text-[9.5px]">{FACTOR_LABELS[r.factor]}</div>
              </div>
              <span className="num shrink-0 rounded-[3px] bg-forest-soft px-1.5 py-px text-[11.5px] font-medium text-forest-deep" title="Score change when this is simulated">
                +{r.scoreDelta}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{r.detail}</p>
            <button
              type="button"
              disabled={stale}
              onClick={() => apply(r)}
              title={stale ? 'Re-run first: these suggestions were tested against the previous conditions' : undefined}
              className="mt-2 flex items-center gap-1 rounded-[3px] border border-forest px-2 py-0.5 text-[11.5px] font-medium text-forest hover:bg-forest hover:text-surface disabled:border-line disabled:text-ink-3 disabled:hover:bg-transparent"
            >
              Apply and re-run <ArrowUpRight size={11} />
              <span className="num ml-1 font-normal opacity-80">→ {r.newOverall}</span>
            </button>
          </div>
        ))}
        {recommendations.length > 0 && <p className="text-[11px] leading-snug text-ink-3">Each change was simulated on its own over the same period and ranked by the score it produced.</p>}
      </Section>

      <Section title="What is working">
        {explanation.suitable.length === 0 && <p className="text-[12px] text-ink-3">No factor scores above 75.</p>}
        <ul className="flex flex-col gap-1.5">
          {explanation.suitable.map((s) => (
            <li key={s} className="flex gap-1.5 text-[12px] leading-snug">
              <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-forest" />
              {s}
            </li>
          ))}
        </ul>
      </Section>

      {explanation.problems.length > 0 && (
        <Section title="What is holding it back">
          <ul className="flex flex-col gap-1.5">
            {explanation.problems.map((s) => (
              <li key={s} className="flex gap-1.5 text-[12px] leading-snug">
                <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-rust" />
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Stress indicators">
        {result.stresses.length === 0 && <p className="text-[12px] text-ink-3">No stress detected during the run.</p>}
        {result.stresses.map((s) => (
          <button key={s.key} type="button" onClick={() => setDay(Math.max(0, s.firstDay))} title={`Jump to day ${s.firstDay}`} className="group text-left">
            <div className="flex items-baseline justify-between gap-2">
              <span className="group-hover:text-forest">{s.label}</span>
              <span className="num text-[11px] text-ink-3">
                {s.daysActive} d · from day {s.firstDay}
              </span>
            </div>
            <div className="mt-1 h-[4px] overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, s.mean * 100)}%`, background: s.mean > 0.4 ? 'var(--color-rust)' : 'var(--color-amber)' }} />
            </div>
          </button>
        ))}
        {explanation.risks.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 text-[11.5px] leading-snug text-ink-2">
            {explanation.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Growth estimate">
        <Readout label="Growth potential" value={`${g.potentialPct} % of optimum`} tone={g.potentialPct >= 65 ? 'good' : g.potentialPct >= 35 ? 'warn' : 'bad'} />
        <Readout label="New leaves" value={`+${g.leavesGrown}`} />
        <Readout label="Leaves lost" value={`−${g.leavesLost}`} tone={g.leavesLost > 0 ? 'warn' : undefined} />
        <Readout label="Leaves at end" value={g.finalLeafCount} />
        <Readout label="Health at end" value={g.survived ? `${g.finalHealth} %` : `died day ${g.daysToDeath}`} tone={!g.survived ? 'bad' : g.finalHealth >= 70 ? 'good' : 'warn'} />
        <Readout label="Water use" value={`${Math.round(result.derived.meanWaterUseMl)} ml / day`} />
      </Section>

      <div className="px-3 py-3 text-[11px] leading-snug text-ink-3">
        This is an estimate from a transparent rule-based model, not a guarantee of how a real plant will grow. Thresholds are approximate horticultural ranges and the model has not been validated against growth trials. Select the plant to read the assumptions.
      </div>
    </div>
  )
}
