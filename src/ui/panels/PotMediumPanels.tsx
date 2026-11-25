import { defaultConfig } from '../../sim/defaults'
import { derive } from '../../sim/engine'
import { MEDIA, MEDIUM_IDS, MEDIUM_PRESETS, matchPreset, mixTotal, setMixComponent } from '../../sim/media'
import { POT_MATERIALS, POT_SHAPES, dimsForVolume, potVolumeL } from '../../sim/pots'
import { getSpecies } from '../../sim/species'
import type { PotMaterialId, PotShapeId } from '../../sim/types'
import { useLab, useSnapshot } from '../../store/useLab'
import { ChoiceGrid, Note, NumberField, NumberInput, Readout, ScoreBar, Section, Segmented, Toggle } from '../controls/controls'

const DEF = defaultConfig()
const POT_COLORS = ['#b9673e', '#e8e3d8', '#2f3331', '#a7a59f', '#6f8f7a', '#3f5d7a', '#c9a35a', '#7a4a3a']

export function PotPanel() {
  const pot = useLab((s) => s.experiment.config.pot)
  const config = useLab((s) => s.experiment.config)
  const update = useLab((s) => s.update)
  const snap = useSnapshot()
  const mat = POT_MATERIALS[pot.material]
  const volume = potVolumeL(pot)
  const d = derive(config)

  return (
    <>
      <Section title="Material">
        <ChoiceGrid
          value={pot.material}
          options={Object.values(POT_MATERIALS).map((m) => ({ value: m.id, label: m.label, swatch: m.defaultColor }))}
          onChange={(id: PotMaterialId) =>
            update((x) => {
              // follow the material's natural colour unless the user picked a custom one
              if (x.pot.color === POT_MATERIALS[x.pot.material].defaultColor) x.pot.color = POT_MATERIALS[id].defaultColor
              x.pot.material = id
            })
          }
        />
        <Note>{mat.description}</Note>
        <Readout label="Drying through walls" value={`× ${mat.evaporation.toFixed(2)}`} />
      </Section>

      <Section title="Shape & size">
        <Segmented ariaLabel="Pot shape" value={pot.shape} options={Object.values(POT_SHAPES).map((s) => ({ value: s.id, label: s.label }))} onChange={(v: PotShapeId) => update((x) => void (x.pot.shape = v))} />
        <NumberField label="Width" unit="cm" min={8} max={60} step={0.5} value={pot.widthCm} defaultValue={DEF.pot.widthCm} onChange={(v) => update((x) => void (x.pot.widthCm = v), 'pot-w')} />
        <NumberField label="Height" unit="cm" min={6} max={60} step={0.5} value={pot.heightCm} defaultValue={DEF.pot.heightCm} onChange={(v) => update((x) => void (x.pot.heightCm = v), 'pot-h')} />
        <NumberField
          label="Volume"
          unit="L"
          min={0.3}
          max={80}
          step={0.1}
          value={Math.round(volume * 10) / 10}
          onChange={(v) =>
            update((x) => {
              const dims = dimsForVolume(x.pot, v)
              x.pot.widthCm = Math.min(60, Math.max(8, dims.widthCm))
              x.pot.heightCm = Math.min(60, Math.max(6, dims.heightCm))
            }, 'pot-v')
          }
          hint="Editing volume scales width and height together."
        />
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-ink-3">
            <span>Root zone in use</span>
            <span className="num">{Math.round(snap.rootFill * 100)} %</span>
          </div>
          <ScoreBar value={snap.rootFill > 1 ? 30 : snap.rootFill > 0.85 ? 60 : 90} />
          <div className="mt-1 text-[11px] text-ink-3">
            {snap.rootFill > 1 ? 'Root-bound: the plant has outgrown this pot.' : snap.rootFill < 0.2 ? 'Roomy: a large volume of mix stays wet for longer.' : `${d.mediumVolumeL.toFixed(1)} L of medium for the roots.`}
          </div>
        </div>
      </Section>

      <Section title="Drainage">
        <Toggle
          label="Drainage holes"
          checked={pot.drainageHoles}
          onChange={(v) => update((x) => void (x.pot.drainageHoles = v))}
          hint={pot.drainageHoles ? 'Shown with a saucer. Excess water can leave.' : mat.alwaysDrains ? 'Fabric still drains through its walls.' : 'Sealed base. Excess water has nowhere to go.'}
        />
      </Section>

      <Section title="Colour">
        <div className="flex flex-wrap items-center gap-1.5">
          {POT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pot colour ${c}`}
              aria-pressed={pot.color === c}
              onClick={() => update((x) => void (x.pot.color = c))}
              className={`h-5 w-5 rounded-full border ${pot.color === c ? 'border-ink ring-1 ring-ink ring-offset-1 ring-offset-panel' : 'border-black/15'}`}
              style={{ background: c }}
            />
          ))}
          <label className="ml-1 flex h-5 cursor-pointer items-center gap-1 rounded-[3px] border border-line bg-surface px-1.5 text-[11px] text-ink-2">
            Custom
            <input type="color" value={pot.color} onChange={(e) => update((x) => void (x.pot.color = e.target.value), 'pot-color')} className="h-3.5 w-5 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </div>
        <p className="text-[11px] text-ink-3">Cosmetic. Colour has no effect on the simulation.</p>
      </Section>
    </>
  )
}

function PropertyBar({ label, value, max, target, unit }: { label: string; value: number; max: number; target?: number; unit: string }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-ink-2">{label}</span>
        <span className="num text-[12px]">
          {Math.round(value * 100)} {unit}
        </span>
      </div>
      <div className="relative mt-1 h-[4px] rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 rounded-full bg-ink-2" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        {target !== undefined && <div className="absolute top-[-3px] h-[10px] w-[2px] bg-forest" title="Species target" style={{ left: `${(target / max) * 100}%` }} />}
      </div>
    </div>
  )
}

export function MediumPanel() {
  const config = useLab((s) => s.experiment.config)
  const update = useLab((s) => s.update)
  const medium = config.medium
  const sh = medium.semiHydro
  const sp = getSpecies(config.speciesId)
  const d = derive(config)
  const preset = matchPreset(medium.mix, sh.enabled)
  const total = mixTotal(medium.mix)
  const snap = useSnapshot()

  return (
    <>
      <Section title="Growing medium" aside={<span className="num text-[11px] text-ink-3">{preset ? preset.label : 'Custom mix'}</span>}>
        <ChoiceGrid
          value={preset?.id ?? null}
          options={MEDIUM_PRESETS.map((p) => ({ value: p.id, label: p.label, note: p.note }))}
          onChange={(id) => {
            const p = MEDIUM_PRESETS.find((x) => x.id === id)!
            update((x) => {
              x.medium.mix = { ...p.mix }
              x.medium.semiHydro.enabled = p.semiHydro
            })
          }}
        />
      </Section>

      <Section
        title="Custom mix"
        aside={
          <span className={`num text-[11px] ${total === 100 ? 'text-forest' : 'text-rust'}`}>
            total {total} %
          </span>
        }
      >
        {/* stacked bar of the blend */}
        <div className="flex h-[8px] overflow-hidden rounded-full border border-line">
          {MEDIUM_IDS.filter((id) => medium.mix[id] > 0).map((id) => (
            <div key={id} title={`${MEDIA[id].label} ${medium.mix[id]} %`} style={{ width: `${medium.mix[id]}%`, background: MEDIA[id].color }} />
          ))}
        </div>
        {MEDIUM_IDS.map((id) => {
          const v = medium.mix[id]
          return (
            <div key={id} className="flex items-center gap-2" title={MEDIA[id].description}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/15" style={{ background: MEDIA[id].color }} />
              <span className={`w-[78px] shrink-0 truncate ${v ? 'text-ink' : 'text-ink-3'}`}>{MEDIA[id].label}</span>
              <input
                type="range"
                className="slider flex-1"
                aria-label={`${MEDIA[id].label} percentage`}
                min={0}
                max={100}
                step={5}
                value={v}
                style={{ '--fill': `${v}%` } as React.CSSProperties}
                onChange={(e) => update((x) => void (x.medium.mix = setMixComponent(x.medium.mix, id, parseFloat(e.target.value))), `mix-${id}`)}
              />
              <NumberInput ariaLabel={`${MEDIA[id].label} percent`} value={v} min={0} max={100} step={1} width={40} onChange={(nv) => update((x) => void (x.medium.mix = setMixComponent(x.medium.mix, id, nv)), `mix-${id}`)} />
              <span className="num text-[11px] text-ink-3">%</span>
            </div>
          )
        })}
        <p className="text-[11px] text-ink-3">Changing one component rescales the others so the mix always totals 100 %.</p>
      </Section>

      <Section title="Resulting properties">
        <PropertyBar label="Air space when wet" value={d.airPorosity} max={0.5} target={sp.medium.airPorosityOpt} unit="%" />
        <PropertyBar label="Water held" value={d.waterHolding} max={0.5} unit="%" />
        <PropertyBar label="Free drainage" value={d.drainage} max={1} unit="%" />
        <PropertyBar label="Nutrient holding" value={d.nutrientHolding} max={1} unit="%" />
        <p className="text-[11px] text-ink-3">
          Volume-weighted blend of representative values. The green tick is the {Math.round(sp.medium.airPorosityOpt * 100)} % air space this species prefers.
        </p>
      </Section>

      <Section title="Semi-hydroponics">
        <Toggle label="Grow over a water reservoir" checked={sh.enabled} onChange={(v) => update((x) => void (x.medium.semiHydro.enabled = v))} hint="The pot sits in or holds a reservoir; the medium wicks water upward." />
        {sh.enabled && (
          <>
            <NumberField
              label="Reservoir water level"
              unit="% height"
              min={5}
              max={80}
              step={1}
              value={sh.reservoirPct}
              defaultValue={DEF.medium.semiHydro.reservoirPct}
              onChange={(v) => update((x) => void (x.medium.semiHydro.reservoirPct = v), 'sh-res')}
              hint={`${Math.round(d.reservoirMaxMl)} ml when full. Currently ${Math.round(snap.reservoir * 100)} % full.`}
            />
            <NumberField
              label="Nutrient solution"
              unit="% label"
              min={0}
              max={200}
              step={5}
              value={sh.nutrientStrengthPct}
              defaultValue={DEF.medium.semiHydro.nutrientStrengthPct}
              onChange={(v) => update((x) => void (x.medium.semiHydro.nutrientStrengthPct = v), 'sh-nut')}
              hint={sh.nutrientStrengthPct === 0 ? 'Plain water: an inert medium supplies no nutrition.' : 'Strength relative to the fertiliser label rate.'}
            />
            <NumberField
              label="Flushing frequency"
              unit="days"
              min={0}
              max={60}
              step={1}
              value={sh.flushIntervalDays}
              defaultValue={DEF.medium.semiHydro.flushIntervalDays}
              onChange={(v) => update((x) => void (x.medium.semiHydro.flushIntervalDays = v), 'sh-flush')}
              hint={sh.flushIntervalDays === 0 ? 'Never flushed: mineral salts accumulate.' : 'Rinse with plain water this often to clear salts.'}
            />
            {d.capillarySaturation > 0.25 && <Note tone="warn">This mix holds enough water to stay saturated above a reservoir. Semi-hydro works with inert, coarse media such as LECA or pumice.</Note>}
            <Note>Select the medium or roots to see through the pot. A glass pot shows the reservoir at all times.</Note>
          </>
        )}
        {!sh.enabled && medium.mix.leca >= 70 && <Note tone="warn">LECA holds very little water without a reservoir. Enable semi-hydro or water very frequently.</Note>}
      </Section>
    </>
  )
}
