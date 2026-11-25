import { useMemo } from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import { SYMPTOMS, SYMPTOM_KEYS, diagnose } from '../sim/diagnose'
import type { StressKey, SymptomKey } from '../sim/types'
import { useLab } from '../store/useLab'
import { Note, Section } from './controls/controls'

const STRESS_TARGET: Record<StressKey, string> = {
  lowLight: 'sun',
  scorch: 'sun',
  drought: 'watering',
  waterlogging: 'watering',
  rootRot: 'medium',
  dryAir: 'atmosphere',
  cold: 'temperature',
  heat: 'temperature',
  nutrientDeficiency: 'watering',
  saltBuildup: 'watering',
  rootBound: 'pot',
}

const SUPPORT_TEXT = {
  'conditions and symptoms': 'Your conditions produce this, and it explains what you see.',
  'conditions only': 'Your conditions produce this, though it does not explain the symptoms you ticked.',
  'symptoms only': 'Would explain the symptoms, but your entered conditions do not produce it. Check those settings match reality.',
}

/**
 * Check-up for a real plant: the owner ticks what they see, and the
 * simulation of the entered conditions says which causes are consistent.
 */
export function Checkup() {
  const experiment = useLab((s) => s.experiment)
  const setObservation = useLab((s) => s.setObservation)
  const select = useLab((s) => s.select)
  const apply = useLab((s) => s.applyRecommendation)
  const obs = experiment.observation
  const symptoms = obs?.symptoms ?? []
  const dx = useMemo(() => diagnose(experiment.config, symptoms), [experiment.config, symptoms.join(',')])

  const toggle = (key: SymptomKey) => {
    const next = symptoms.includes(key) ? symptoms.filter((s) => s !== key) : [...symptoms, key]
    setObservation({ symptoms: next, note: obs?.note ?? '', source: obs?.source ?? 'manual', at: Date.now() })
  }

  return (
    <div className="scroll min-h-0 flex-1">
      <Section title="What do you see on the real plant?">
        <div className="flex flex-col">
          {SYMPTOM_KEYS.map((key) => {
            const on = symptoms.includes(key)
            return (
              <button key={key} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(key)} className="flex items-center gap-2 py-[3px] text-left hover:text-forest">
                <span className={`grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[3px] border ${on ? 'border-forest bg-forest text-surface' : 'border-line-strong bg-surface'}`}>{on && <Check size={10} strokeWidth={3} />}</span>
                <span className={on ? 'font-medium' : ''}>{SYMPTOMS[key].label}</span>
                {SYMPTOMS[key].hint && <span className="text-[11px] text-ink-3">{SYMPTOMS[key].hint}</span>}
              </button>
            )
          })}
        </div>
        {obs?.source === 'photo' && obs.note && <Note>From your photo: {obs.note}</Note>}
        <p className="text-[11px] leading-snug text-ink-3">
          Symptoms alone cannot tell causes apart. The ranking below combines them with the light, watering, pot and air you have entered for this plant, so make sure those describe where it really lives.
        </p>
      </Section>

      <Section title={symptoms.length ? 'Most likely causes' : 'Risks in these conditions'}>
        {dx.hypotheses.length === 0 && (
          <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-2">
            <Check size={13} className="mt-0.5 shrink-0 text-forest" /> The model predicts no significant stress in these conditions.
          </p>
        )}
        {dx.hypotheses.map((h, i) => (
          <button key={h.stress} type="button" onClick={() => select(STRESS_TARGET[h.stress])} title="Open the related setting" className="group rounded-[4px] border border-line bg-surface p-2.5 text-left hover:border-line-strong">
            <div className="flex items-baseline gap-2">
              <span className="num text-[11px] text-ink-3">{i + 1}</span>
              <span className="flex-1 font-medium group-hover:text-forest">{h.label}</span>
              <span className="num text-[12px]">{Math.round(h.weight * 100)} %</span>
            </div>
            <div className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, h.weight * 100)}%`, background: h.support === 'symptoms only' ? 'var(--color-ink-3)' : h.weight > 0.4 ? 'var(--color-rust)' : 'var(--color-amber)' }} />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{SUPPORT_TEXT[h.support]}</p>
            {h.explains.length > 0 && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">Explains: {h.explains.map((s) => SYMPTOMS[s].label.toLowerCase()).join('; ')}.</p>}
          </button>
        ))}
        {dx.hypotheses.length > 0 && <p className="text-[11px] leading-snug text-ink-3">Percentages are relative weights among these candidates, not probabilities.</p>}
      </Section>

      {dx.unexplained.length > 0 && (
        <Section title="Not explained by your conditions">
          <Note tone="warn">
            {dx.unexplained.map((s) => SYMPTOMS[s].label).join('; ')}.{' '}
            {dx.mismatch
              ? 'The conditions you entered look fine for this plant, so either they differ from reality (light is the usual culprit) or the cause is outside this model.'
              : 'Nothing the model predicts here would cause this.'}{' '}
            Check for pests under the leaves and at the stem joints, recent repotting or moving, and water quality. This model does not cover pests or disease.
          </Note>
        </Section>
      )}

      <Section title="What to change first">
        {dx.recommendations.length === 0 && <p className="text-[12px] text-ink-3">No single change tested improves on the current setup.</p>}
        {dx.recommendations.map((r) => (
          <div key={r.id} className="rounded-[4px] border border-line bg-surface p-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 font-medium leading-snug">{r.title}</div>
              <span className="num shrink-0 rounded-[3px] bg-forest-soft px-1.5 py-px text-[11.5px] font-medium text-forest-deep">+{r.scoreDelta}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-2">{r.detail}</p>
            <button type="button" onClick={() => apply(r)} className="mt-2 flex items-center gap-1 rounded-[3px] border border-forest px-2 py-0.5 text-[11.5px] font-medium text-forest hover:bg-forest hover:text-surface">
              Try it in the lab <ArrowUpRight size={11} />
            </button>
          </div>
        ))}
      </Section>

      <div className="px-3 py-3 text-[11px] leading-snug text-ink-3">
        A structured guess from a rule-based model, not a diagnosis. Symptom-to-cause links are general horticultural associations and have not been validated.
      </div>
    </div>
  )
}
