import { ChevronRight } from 'lucide-react'
import { defaultConfig } from '../../sim/defaults'
import { derive } from '../../sim/engine'
import { describeMix } from '../../sim/media'
import { POT_MATERIALS } from '../../sim/pots'
import { allSpecies, getSpecies } from '../../sim/species'
import type { LeafState } from '../../sim/types'
import { useLab, useSnapshot } from '../../store/useLab'
import { Note, NumberField, Readout, ScoreBar, Section } from '../controls/controls'
import { SpeciesBadges } from '../Garden'

const DEF = defaultConfig()

function leafCondition(l: LeafState): { text: string; tone: string } {
  if (l.expansion < 0.95) return { text: `unfurling ${Math.round(l.expansion * 100)} %`, tone: 'text-forest' }
  if (l.brown > 0.5) return { text: 'dying back', tone: 'text-rust' }
  if (l.yellow > 0.6) return { text: 'yellow', tone: 'text-rust' }
  if (l.brown > 0.25) return { text: 'browning', tone: 'text-amber' }
  if (l.yellow > 0.2) return { text: 'yellowing', tone: 'text-amber' }
  if (l.brown > 0.08) return { text: 'brown tips', tone: 'text-amber' }
  return { text: 'healthy', tone: 'text-forest' }
}

export function PlantPanel({ part }: { part: 'plant' | 'leaves' | 'stems' | 'roots' }) {
  const config = useLab((s) => s.experiment.config)
  const update = useLab((s) => s.update)
  const setSpecies = useLab((s) => s.setSpecies)
  useLab((s) => s.customSpecies)
  const day = useLab((s) => s.day)
  const snap = useSnapshot()
  const sp = getSpecies(config.speciesId)
  const when = day > 0 ? `day ${Math.floor(day)}` : 'start'
  const tallest = snap.leaves.reduce((m, l) => Math.max(m, l.sizeCm * l.expansion), 0)

  return (
    <>
      {part === 'plant' && (
        <Section title="Species">
          <select aria-label="Species" className="select w-full" value={sp.id} onChange={(e) => setSpecies(e.target.value)}>
            {allSpecies().map((s) => (
              <option key={s.id} value={s.id}>
                {s.commonName} · {s.scientificName}
                {s.source === 'ai' ? ' (AI-estimated)' : ''}
              </option>
            ))}
          </select>
          <div>
            <div className="font-semibold text-[22px] leading-none">{sp.commonName}</div>
            <div className="mt-0.5 text-[12px] italic text-ink-3">{sp.scientificName} · {sp.archetype}</div>
          </div>
          <p className="text-[12px] leading-snug text-ink-2">{sp.summary}</p>
          <div className="flex flex-wrap gap-1"><SpeciesBadges sp={sp} /></div>
          {sp.source === 'ai' && <Note tone="warn">This profile was estimated by an AI model and has not been checked against a horticultural source. Treat its scores as a rough guide.</Note>}
          <p className="text-[11px] leading-snug text-ink-3">Switching species keeps the light, air and temperature of this spot and resets the pot, mix and watering to that plant's usual setup.</p>
        </Section>
      )}

      <Section title={`Condition · ${when}`}>
        {(part === 'plant' || part === 'leaves') && (
          <>
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-ink-2">Health</span>
                <span className="num">{snap.alive ? `${Math.round(snap.health)} %` : 'dead'}</span>
              </div>
              <ScoreBar value={snap.health} />
            </div>
            <Readout label="Leaves" value={`${snap.leaves.length}${snap.leavesGrown ? `  (+${snap.leavesGrown} grown)` : ''}${snap.leavesLost ? `  (−${snap.leavesLost} lost)` : ''}`} />
            <Readout label="Largest leaf" value={`${Math.round(tallest)} cm`} />
            <Readout label="Leaf firmness" value={`${Math.round(snap.turgor * 100)} %`} tone={snap.turgor < 0.6 ? 'bad' : snap.turgor < 0.85 ? 'warn' : 'good'} />
          </>
        )}
        {(part === 'plant' || part === 'stems') && (
          <>
            <Readout label="Petiole stretch" value={`× ${snap.etiolation.toFixed(2)}`} tone={snap.etiolation > 1.25 ? 'warn' : undefined} />
            {part === 'stems' && <p className="text-[11px] text-ink-3">Petioles lengthen in low light as the plant reaches for it, giving a leggy look.</p>}
          </>
        )}
        {(part === 'plant' || part === 'roots') && (
          <>
            <Readout label="Root health" value={`${Math.round(snap.rootHealth * 100)} %`} tone={snap.rootHealth < 0.5 ? 'bad' : snap.rootHealth < 0.8 ? 'warn' : 'good'} />
            <Readout label="Root zone in use" value={`${Math.round(snap.rootFill * 100)} %`} tone={snap.rootFill > 1 ? 'bad' : undefined} />
            {part === 'roots' && <Note>The pot turns translucent while roots are selected. Pale roots are healthy; brown roots have been starved of oxygen.</Note>}
          </>
        )}
      </Section>

      {part === 'leaves' && (
        <Section title="Leaves, oldest first">
          {snap.leaves.length === 0 && <p className="text-ink-3">No leaves remain.</p>}
          <div className="flex flex-col">
            {snap.leaves.map((l, i) => {
              const c = leafCondition(l)
              return (
                <div key={l.id} className="flex items-center gap-2 border-b border-line py-1 last:border-0">
                  <span className="num w-5 text-ink-3">{i + 1}</span>
                  <span className="num w-12">{Math.round(l.sizeCm * l.expansion)} cm</span>
                  <span className="num w-16 text-[11px] text-ink-3">{l.fenestration > 0.6 ? 'split+holes' : l.fenestration > 0.15 ? 'split' : 'entire'}</span>
                  <span className={`flex-1 text-right ${c.tone}`}>{c.text}</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {part === 'plant' && (
        <>
          <Section title="Starting plant">
            <NumberField label="Leaves" unit="count" min={1} max={Math.min(24, sp.growth.maxLeaves)} step={1} value={config.plant.initialLeafCount} defaultValue={DEF.plant.initialLeafCount} onChange={(v) => update((d) => void (d.plant.initialLeafCount = v), 'p-leaves')} />
            <NumberField
              label="Initial health"
              unit="%"
              min={20}
              max={100}
              step={1}
              value={config.plant.initialHealth}
              defaultValue={DEF.plant.initialHealth}
              onChange={(v) => update((d) => void (d.plant.initialHealth = v), 'p-health')}
              hint="A weak plant starts with tired older leaves and fewer working roots."
            />
          </Section>
          <Section title="Published values used" aside={<span className="num text-[11px] text-ink-3">{sp.evidence?.length ?? 0} sourced</span>}>
            {!sp.evidence?.length && <p className="text-[12px] leading-snug text-ink-2">No species-specific published values are attached to this profile. Its numbers are group-level guidance and assumptions.</p>}
            <ul className="flex flex-col">
              {sp.evidence?.map((e) => (
                <li key={e.field + e.source} className="border-b border-line py-1.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-2">{e.field}</span>
                    <span className="num text-right text-[12px]">{e.value}</span>
                  </div>
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-[10.5px] text-forest underline-offset-2 hover:underline">{e.source}</a>
                  ) : (
                    <span className="text-[10.5px] text-ink-3">{e.source}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-snug text-ink-3">Everything not listed here (water use per leaf area, days between leaves, root-zone thresholds) has no published value for this species and is a model assumption.</p>
          </Section>
          <Section title="Model assumptions">
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11.5px] leading-snug text-ink-2">
              {sp.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex items-center gap-2 border-b border-line py-1.5 text-left last:border-0 hover:text-forest">
      <span className="w-[88px] shrink-0 text-ink-2 group-hover:text-forest">{label}</span>
      <span className="num min-w-0 flex-1 truncate text-right text-[12px]">{value}</span>
      <ChevronRight size={12} className="shrink-0 text-ink-3" />
    </button>
  )
}

/** Shown when nothing (or the Environment group) is selected: the whole setup at a glance. */
export function EnvironmentPanel() {
  const config = useLab((s) => s.experiment.config)
  const select = useLab((s) => s.select)
  const d = derive(config)
  const h = config.humidity
  const rh = h.humidifier ? Math.max(h.ambientRh, h.targetRh) : h.ambientRh
  return (
    <>
      <Section title="Environment" aside={<span className="rounded-[3px] border border-line px-1.5 py-px text-[10.5px] text-ink-2">Lab bench</span>}>
        <p className="text-[12px] leading-snug text-ink-2">One plant on the lab bench with conditions you control. Click any object in the viewport or the hierarchy to edit it.</p>
        <div className="flex flex-col">
          <Row label="Sunlight" value={`${config.light.ppfd} µmol × ${config.light.hoursPerDay} h · DLI ${d.totalDli.toFixed(1)}`} onClick={() => select('sun')} />
          <Row label="Humidity" value={`${Math.round(rh)} % RH${h.humidifier ? ' (humidifier)' : ''}`} onClick={() => select('atmosphere')} />
          <Row label="Temperature" value={`${config.temperature.minC}–${config.temperature.maxC} °C`} onClick={() => select('temperature')} />
          <Row
            label="Watering"
            value={config.medium.semiHydro.enabled ? `top up every ${config.watering.intervalDays} d` : `${config.watering.amountMl} ml / ${config.watering.intervalDays} d`}
            onClick={() => select('watering')}
          />
          <Row label="Pot" value={`${POT_MATERIALS[config.pot.material].label}, ${d.potVolumeL.toFixed(1)} L`} onClick={() => select('pot')} />
          <Row label="Medium" value={describeMix(config.medium.mix)} onClick={() => select('medium')} />
          <Row label="Plant" value={`${d.species.commonName}, ${config.plant.initialLeafCount} leaves`} onClick={() => select('plant')} />
        </div>
      </Section>
      <Section title="How to use">
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[12px] leading-snug text-ink-2">
          <li>Set up the conditions you can actually offer the plant.</li>
          <li>Run the simulation and scrub the timeline to watch it respond.</li>
          <li>Read the results, apply a suggested change, and run again.</li>
        </ol>
        <Note>Conditions here are whatever you set, not the greenhouse's. Time only moves when you run the simulation.</Note>
      </Section>
    </>
  )
}
