import { Copy, Plus, Trash2 } from 'lucide-react'
import { defaultConfig } from '../../sim/defaults'
import { lightSuitability } from '../../sim/engine'
import { LIGHT_PRESETS, PPFD_PER_LUX, dli, growDli, ppfdToLux, sunDli } from '../../sim/light'
import { getSpecies } from '../../sim/species'
import type { GrowLight } from '../../sim/types'
import { kelvinToCss } from '../../scene/util'
import { useLab } from '../../store/useLab'
import { ChoiceGrid, Note, NumberField, NumberInput, Readout, ScoreBar, Section, Segmented, Toggle } from '../controls/controls'
import { SunDial } from '../controls/SunDial'

const DEF = defaultConfig()

function DliSummary() {
  const light = useLab((s) => s.experiment.config.light)
  const sp = getSpecies(useLab((s) => s.experiment.config.speciesId))
  const sun = sunDli(light)
  const grow = growDli(light)
  const total = sun + grow
  const score = Math.round(lightSuitability(sp, total) * 100)
  const scorch = light.exposure === 'direct' && light.ppfd > sp.light.scorchPpfd
  return (
    <>
      <div className="rounded-[4px] border border-line bg-surface px-2.5 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-2">Daily light integral</span>
          <span>
            <span className="num text-[18px] font-medium">{total.toFixed(1)}</span>
            <span className="num ml-1 text-[11px] text-ink-3">mol·m⁻²·d⁻¹</span>
          </span>
        </div>
        <div className="mt-1.5">
          <ScoreBar value={score} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-3">
          <span>
            {sp.commonName} optimum {sp.light.dliOptLow}–{sp.light.dliOptHigh}
          </span>
          <span className="num">
            sun {sun.toFixed(1)}
            {grow > 0 ? ` + lamps ${grow.toFixed(1)}` : ''}
          </span>
        </div>
      </div>
      {scorch && (
        <Note tone="warn">
          Unfiltered direct light above about {sp.light.scorchPpfd} µmol·m⁻²·s⁻¹ is modelled as a leaf-scorch risk for this species.
        </Note>
      )}
    </>
  )
}

export function SunPanel() {
  const light = useLab((s) => s.experiment.config.light)
  const update = useLab((s) => s.update)
  const preset = LIGHT_PRESETS.find((p) => p.ppfd === light.ppfd && p.hours === light.hoursPerDay && p.exposure === light.exposure)
  return (
    <>
      <Section title="Light at the canopy">
        <DliSummary />
        <ChoiceGrid
          value={preset?.id ?? null}
          columns={1}
          options={LIGHT_PRESETS.map((p) => ({ value: p.id, label: p.label, note: `${p.note} · ${p.ppfd} µmol × ${p.hours} h` }))}
          onChange={(id) => {
            const p = LIGHT_PRESETS.find((x) => x.id === id)!
            update((d) => {
              d.light.ppfd = p.ppfd
              d.light.hoursPerDay = p.hours
              d.light.exposure = p.exposure
            })
          }}
        />
        <NumberField
          label="Intensity (PPFD)"
          unit="µmol/m²/s"
          min={0}
          max={1500}
          step={1}
          value={light.ppfd}
          defaultValue={DEF.light.ppfd}
          onChange={(v) => update((d) => void (d.light.ppfd = v), 'ppfd')}
        />
        <div className="flex items-center gap-1.5">
          <label className="flex-1 text-ink-2" htmlFor="lux">Or enter a light-meter reading</label>
          <NumberInput ariaLabel="Measured lux" value={Math.round(ppfdToLux(light.ppfd))} min={0} max={81000} step={1} width={64} onChange={(lux) => update((d) => void (d.light.ppfd = Math.round(lux * PPFD_PER_LUX)), 'lux')} />
          <span className="num w-[62px] shrink-0 text-[10.5px] text-ink-3">lux</span>
        </div>
        <p className="text-[11px] leading-snug text-ink-3">Daylight converts at about 54 lux per µmol. Phone light-meter apps can be off by a third or more, but that still beats judging by eye.</p>
        <NumberField
          label="Daily exposure"
          unit="h / day"
          min={0}
          max={16}
          step={0.5}
          value={light.hoursPerDay}
          defaultValue={DEF.light.hoursPerDay}
          onChange={(v) => update((d) => void (d.light.hoursPerDay = v), 'hours')}
        />
        <div>
          <div className="mb-1 text-ink-2">Exposure</div>
          <Segmented
            ariaLabel="Exposure"
            value={light.exposure}
            options={[
              { value: 'indirect', label: 'Indirect', title: 'Filtered or reflected light' },
              { value: 'direct', label: 'Direct', title: 'Unfiltered sun on the leaves' },
            ]}
            onChange={(v) => update((d) => void (d.light.exposure = v))}
          />
        </div>
        <Note>
          The room positions above are distance bands from university extension guidance, not measurements of your room. Viewport brightness is only an impression; the simulation uses PPFD and DLI.
        </Note>
      </Section>

      <Section title="Sun position">
        <SunDial
          azimuth={light.azimuthDeg}
          elevation={light.elevationDeg}
          color={kelvinToCss(light.colorK)}
          onChange={(az, el) =>
            update((d) => {
              d.light.azimuthDeg = az
              d.light.elevationDeg = el
            }, 'sun-dial')
          }
        />
        <NumberField label="Azimuth" unit="°" min={0} max={359} step={1} value={light.azimuthDeg} defaultValue={DEF.light.azimuthDeg} onChange={(v) => update((d) => void (d.light.azimuthDeg = v), 'az')} />
        <NumberField label="Elevation" unit="°" min={5} max={90} step={1} value={light.elevationDeg} defaultValue={DEF.light.elevationDeg} onChange={(v) => update((d) => void (d.light.elevationDeg = v), 'el')} />
        <Note>Drag the sun in the viewport or on the dial. Direction sets shadows and which way the plant leans. In Studio mode the amount of light is set by intensity and hours, not by angle.</Note>
      </Section>

      <Section title="Light colour">
        <NumberField
          label="Colour temperature"
          unit="K"
          min={2700}
          max={7500}
          step={100}
          value={light.colorK}
          defaultValue={DEF.light.colorK}
          onChange={(v) => update((d) => void (d.light.colorK = v), 'kelvin')}
          hint="Visual only. Spectrum is not part of the growth model."
        />
      </Section>

      <GrowLightList />
    </>
  )
}

export function GrowLightList() {
  const lights = useLab((s) => s.experiment.config.light.growLights)
  const add = useLab((s) => s.addGrowLight)
  const select = useLab((s) => s.select)
  return (
    <Section
      title="Additional light sources"
      aside={
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-[3px] border border-line bg-surface px-1.5 py-0.5 text-[11.5px] hover:border-forest hover:text-forest">
          <Plus size={11} /> Grow light
        </button>
      }
    >
      {lights.length === 0 && <p className="text-[11.5px] text-ink-3">None. Add a grow light to supplement the sun.</p>}
      {lights.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => select(`light:${g.id}`)}
          className="flex items-center gap-2 rounded-[4px] border border-line bg-surface px-2 py-1.5 text-left hover:border-line-strong"
        >
          <span className="h-2.5 w-2.5 rounded-full border border-black/15" style={{ background: g.enabled ? kelvinToCss(g.colorK) : 'var(--color-line-strong)' }} />
          <span className="flex-1 truncate">{g.name}</span>
          <span className="num text-[11px] text-ink-3">{g.enabled ? `+${dli(g.ppfd, g.hoursPerDay).toFixed(1)} DLI` : 'off'}</span>
        </button>
      ))}
    </Section>
  )
}

export function GrowLightPanel({ id }: { id: string }) {
  const g = useLab((s) => s.experiment.config.light.growLights.find((x) => x.id === id))
  const update = useLab((s) => s.update)
  const duplicate = useLab((s) => s.duplicateGrowLight)
  const remove = useLab((s) => s.removeGrowLight)
  if (!g) return <p className="p-3 text-ink-3">This light was removed.</p>
  const edit = (fn: (l: GrowLight) => void, key?: string) =>
    update((d) => {
      const l = d.light.growLights.find((x) => x.id === id)
      if (l) fn(l)
    }, key && `${id}-${key}`)
  return (
    <>
      <Section title="Light at the canopy">
        <DliSummary />
      </Section>
      <Section title="Grow light">
        <Toggle label="Switched on" checked={g.enabled} onChange={(v) => edit((l) => void (l.enabled = v))} />
        <NumberField
          label="PPFD at canopy"
          unit="µmol/m²/s"
          min={0}
          max={800}
          step={5}
          value={g.ppfd}
          defaultValue={150}
          disabled={!g.enabled}
          onChange={(v) => edit((l) => void (l.ppfd = v), 'ppfd')}
          hint="What reaches the leaves, which depends on the lamp and its distance."
        />
        <NumberField label="Photoperiod" unit="h / day" min={0} max={24} step={0.5} value={g.hoursPerDay} defaultValue={12} disabled={!g.enabled} onChange={(v) => edit((l) => void (l.hoursPerDay = v), 'hours')} />
        <NumberField label="Colour temperature" unit="K" min={2700} max={6500} step={100} value={g.colorK} defaultValue={4000} onChange={(v) => edit((l) => void (l.colorK = v), 'k')} hint="Visual only." />
        <Readout label="Contribution" value={g.enabled ? `+${dli(g.ppfd, g.hoursPerDay).toFixed(1)} mol·m⁻²·d⁻¹` : 'off'} />
      </Section>
      <Section title="Object">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => duplicate(id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-line bg-surface py-1.5 hover:border-line-strong">
            <Copy size={12} /> Duplicate
          </button>
          <button type="button" onClick={() => remove(id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-line bg-surface py-1.5 text-rust hover:border-rust">
            <Trash2 size={12} /> Remove
          </button>
        </div>
      </Section>
    </>
  )
}
