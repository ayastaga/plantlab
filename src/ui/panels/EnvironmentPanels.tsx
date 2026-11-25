import { defaultConfig } from '../../sim/defaults'
import { derive, humiditySuitability, temperatureGrowth } from '../../sim/engine'
import { vpdKpa } from '../../sim/light'
import { getSpecies } from '../../sim/species'
import { useLab, useSnapshot } from '../../store/useLab'
import { Note, NumberField, Readout, ScoreBar, Section, Segmented, Toggle } from '../controls/controls'
import { Thermometer } from '../controls/Thermometer'

const DEF = defaultConfig()

export function AtmospherePanel() {
  const h = useLab((s) => s.experiment.config.humidity)
  const meanC = useLab((s) => s.experiment.config.temperature.meanC)
  const sp = getSpecies(useLab((s) => s.experiment.config.speciesId))
  const update = useLab((s) => s.update)
  const effective = h.humidifier ? Math.max(h.ambientRh, h.targetRh) : h.ambientRh
  const score = Math.round(humiditySuitability(sp, effective) * 100)
  const pct = (v: number) => `${v}%`
  return (
    <>
      <Section title="Relative humidity">
        <div className="rounded-[4px] border border-line bg-surface px-2.5 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-2">Air around the plant</span>
            <span>
              <span className="num text-[18px] font-medium">{Math.round(effective)}</span>
              <span className="num ml-1 text-[11px] text-ink-3">% RH</span>
            </span>
          </div>
          {/* where this sits against the species' range */}
          <div className="relative mt-2 h-[6px] rounded-full bg-line">
            <div className="absolute inset-y-0 rounded-full bg-forest-soft" style={{ left: pct(sp.humidity.optLowRh), width: pct(sp.humidity.optHighRh - sp.humidity.optLowRh) }} />
            <div className="absolute top-[-3px] h-[12px] w-[2px] bg-ink" style={{ left: pct(effective) }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-3">
            <span>
              preferred {sp.humidity.optLowRh}–{sp.humidity.optHighRh} %
            </span>
            <span className="num">VPD {vpdKpa(meanC, effective).toFixed(2)} kPa</span>
          </div>
          <div className="mt-1.5">
            <ScoreBar value={score} />
          </div>
        </div>
        <NumberField label="Ambient humidity" unit="% RH" min={10} max={100} step={1} value={h.ambientRh} defaultValue={DEF.humidity.ambientRh} onChange={(v) => update((d) => void (d.humidity.ambientRh = v), 'rh')} />
        <NumberField
          label="Fluctuation"
          unit="± %"
          min={0}
          max={25}
          step={1}
          value={h.fluctuation}
          defaultValue={DEF.humidity.fluctuation}
          onChange={(v) => update((d) => void (d.humidity.fluctuation = v), 'rhf')}
          hint="Day-to-day swing around the ambient value."
        />
      </Section>
      <Section title="Humidifier">
        <Toggle label="Run a humidifier" checked={h.humidifier} onChange={(v) => update((d) => void (d.humidity.humidifier = v))} hint="Holds the air at the target whenever ambient humidity is lower." />
        <NumberField label="Target humidity" unit="% RH" min={30} max={95} step={1} value={h.targetRh} defaultValue={DEF.humidity.targetRh} disabled={!h.humidifier} onChange={(v) => update((d) => void (d.humidity.targetRh = v), 'rht')} />
        <Note>The mist in the viewport thickens with humidity as visual feedback. The simulation reads the RH number, which also drives water use through vapour-pressure deficit.</Note>
      </Section>
    </>
  )
}

export function TemperaturePanel() {
  const t = useLab((s) => s.experiment.config.temperature)
  const sp = getSpecies(useLab((s) => s.experiment.config.speciesId))
  const update = useLab((s) => s.update)
  const snap = useSnapshot()
  const day = useLab((s) => s.day)

  // keep low ≤ mean ≤ high by pushing the neighbours
  const set = (handle: 'mean' | 'min' | 'max', v: number, key: string) =>
    update((d) => {
      const x = d.temperature
      if (handle === 'mean') {
        x.meanC = v
        x.minC = Math.min(x.minC, v)
        x.maxC = Math.max(x.maxC, v)
      } else if (handle === 'min') {
        x.minC = v
        x.meanC = Math.max(x.meanC, v)
        x.maxC = Math.max(x.maxC, x.meanC)
      } else {
        x.maxC = v
        x.meanC = Math.min(x.meanC, v)
        x.minC = Math.min(x.minC, x.meanC)
      }
    }, key)

  const growth = Math.round(temperatureGrowth(sp, t.meanC) * 100)
  const tp = sp.temperature
  return (
    <>
      <Section title="Air temperature">
        <div className="flex items-start gap-1">
          <Thermometer mean={t.meanC} min={t.minC} max={t.maxC} optLow={tp.optLowC} optHigh={tp.optHighC} damageBelow={tp.damageMinC} onChange={(h, v) => set(h, v, `t-${h}-drag`)} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
            <div>
              <div className="text-ink-2">{day > 0 ? `Day ${Math.floor(day)}` : 'Current'}</div>
              <div>
                <span className="num text-[20px] font-medium">{snap.env.tMeanC.toFixed(1)}</span>
                <span className="num ml-1 text-[11px] text-ink-3">°C</span>
              </div>
            </div>
            <Readout label="Night low" value={`${snap.env.tMinC.toFixed(1)} °C`} tone={snap.env.tMinC < tp.damageMinC ? 'bad' : undefined} />
            <Readout label="Day high" value={`${snap.env.tMaxC.toFixed(1)} °C`} tone={snap.env.tMaxC > tp.heatStressC ? 'bad' : undefined} />
            <div className="mt-1">
              <div className="mb-1 flex justify-between text-[11px] text-ink-3">
                <span>Growth rate</span>
                <span className="num">{growth} %</span>
              </div>
              <ScoreBar value={growth} />
            </div>
          </div>
        </div>
      </Section>
      <Section title="Exact values">
        <NumberField label="Mean" unit="°C" min={0} max={42} step={0.5} value={t.meanC} defaultValue={DEF.temperature.meanC} onChange={(v) => set('mean', v, 't-mean')} />
        <NumberField label="Minimum (night)" unit="°C" min={0} max={42} step={0.5} value={t.minC} defaultValue={DEF.temperature.minC} onChange={(v) => set('min', v, 't-min')} />
        <NumberField label="Maximum (day)" unit="°C" min={0} max={42} step={0.5} value={t.maxC} defaultValue={DEF.temperature.maxC} onChange={(v) => set('max', v, 't-max')} />
        <NumberField
          label="Fluctuation"
          unit="± °C"
          min={0}
          max={8}
          step={0.5}
          value={t.fluctuationC}
          defaultValue={DEF.temperature.fluctuationC}
          onChange={(v) => update((d) => void (d.temperature.fluctuationC = v), 't-fl')}
          hint="Day-to-day drift applied to the whole range, like passing weather."
        />
        <Note>
          {sp.commonName}: best growth {tp.optLowC}–{tp.optHighC} °C, growth stalls near {tp.growthMinC} °C, chilling injury below about {tp.damageMinC} °C.
        </Note>
      </Section>
    </>
  )
}

function moistureLabel(theta: number): { text: string; tone?: 'good' | 'warn' | 'bad' } {
  if (theta > 1.02) return { text: 'Waterlogged', tone: 'bad' }
  if (theta > 0.8) return { text: 'Wet', tone: 'warn' }
  if (theta > 0.4) return { text: 'Evenly moist', tone: 'good' }
  if (theta > 0.25) return { text: 'Drying', tone: 'warn' }
  return { text: 'Dry', tone: 'bad' }
}

export function WateringPanel() {
  const config = useLab((s) => s.experiment.config)
  const update = useLab((s) => s.update)
  const select = useLab((s) => s.select)
  const result = useLab((s) => s.result)
  const stale = useLab((s) => s.stale)
  const day = useLab((s) => s.day)
  const snap = useSnapshot()
  const w = config.watering
  const d = derive(config)
  const semi = config.medium.semiHydro.enabled
  const m = moistureLabel(snap.moisture)

  return (
    <>
      <Section title={`Pot moisture · ${day > 0 ? `day ${Math.floor(day)}` : 'start'}`}>
        <div className="rounded-[4px] border border-line bg-surface px-2.5 py-2">
          <div className="flex items-baseline justify-between">
            <span className={m.tone === 'good' ? 'text-forest' : m.tone === 'warn' ? 'text-amber' : 'text-rust'}>{m.text}</span>
            <span>
              <span className="num text-[18px] font-medium">{Math.round(Math.min(1.5, snap.moisture) * 100)}</span>
              <span className="num ml-1 text-[11px] text-ink-3">% of capacity</span>
            </span>
          </div>
          <div className="relative mt-2 h-[6px] overflow-hidden rounded-full bg-line">
            <div className="absolute inset-y-0 bg-forest-soft" style={{ left: '40%', width: '45%' }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-water opacity-80" style={{ width: `${Math.min(100, snap.moisture * 100)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-ink-3">Roots want the shaded band: moist with air, then partly dry before the next watering.</div>
        </div>
        <Readout label="Water the mix can hold" value={`${Math.round(d.capacityMl)} ml`} />
        {semi && <Readout label="Reservoir" value={`${Math.round(snap.reservoir * 100)} % full (${Math.round(d.reservoirMaxMl)} ml max)`} tone={snap.reservoir < 0.05 ? 'bad' : undefined} />}
        {result && !stale && <Readout label="Estimated use" value={`${Math.round(result.derived.meanWaterUseMl)} ml / day`} />}
        {result && !stale && !semi && <Readout label="Schedule that fits" value={`${result.derived.suggestedAmountMl} ml / ${result.derived.suggestedIntervalDays} d`} />}
      </Section>

      <Section title={semi ? 'Reservoir top-up' : 'Watering'}>
        <NumberField
          label={semi ? 'Top-up interval' : 'Watering interval'}
          unit="days"
          min={1}
          max={45}
          step={1}
          value={w.intervalDays}
          defaultValue={DEF.watering.intervalDays}
          onChange={(v) => update((x) => void (x.watering.intervalDays = v), 'w-int')}
        />
        {semi ? (
          <Note>
            In semi-hydro the reservoir is refilled to its set level each time.{' '}
            <button type="button" className="underline hover:text-forest" onClick={() => select('medium')}>
              Reservoir and nutrient settings
            </button>{' '}
            are on the growing medium.
          </Note>
        ) : (
          <>
            <NumberField
              label="Quantity"
              unit="ml"
              min={50}
              max={3000}
              step={25}
              value={w.amountMl}
              defaultValue={DEF.watering.amountMl}
              onChange={(v) => update((x) => void (x.watering.amountMl = v), 'w-amt')}
              hint={`${Math.round((w.amountMl / Math.max(1, d.capacityMl)) * 100)} % of what this pot and mix can hold`}
            />
            <div>
              <div className="mb-1 text-ink-2">Method</div>
              <Segmented
                ariaLabel="Watering method"
                value={w.method}
                options={[
                  { value: 'top', label: 'Top watering', title: 'Pour over the surface; excess drains and flushes salts' },
                  { value: 'bottom', label: 'Bottom watering', title: 'Soak up from a tray; never over-fills, never flushes' },
                ]}
                onChange={(v) => update((x) => void (x.watering.method = v))}
              />
            </div>
            {w.method === 'bottom' && !d.drains && <Note tone="warn">Bottom watering needs drainage holes. With none, no water reaches the roots.</Note>}
          </>
        )}
        <Toggle
          label="Drainage holes"
          checked={config.pot.drainageHoles}
          onChange={(v) => update((x) => void (x.pot.drainageHoles = v))}
          hint={
            d.drains
              ? config.pot.drainageHoles
                ? 'Excess water escapes into the saucer.'
                : 'Fabric drains through its walls.'
              : 'Excess water stays in the pot and fills the air spaces.'
          }
        />
      </Section>

      {!semi && (
        <Section title="Fertiliser">
          <NumberField
            label="Feed interval"
            unit="days"
            min={0}
            max={90}
            step={1}
            value={w.feedIntervalDays}
            defaultValue={DEF.watering.feedIntervalDays}
            onChange={(v) => update((x) => void (x.watering.feedIntervalDays = v), 'f-int')}
            hint={w.feedIntervalDays === 0 ? 'Never fed: the plant relies on what is in the mix.' : undefined}
          />
          <NumberField
            label="Strength"
            unit="% label"
            min={0}
            max={200}
            step={5}
            value={w.feedStrengthPct}
            defaultValue={DEF.watering.feedStrengthPct}
            disabled={w.feedIntervalDays === 0}
            onChange={(v) => update((x) => void (x.watering.feedStrengthPct = v), 'f-str')}
          />
          <Readout label="Nutrient level" value={`${Math.round(Math.min(1.6, snap.nutrients) * 100)} %`} tone={snap.nutrients < 0.3 ? 'bad' : snap.nutrients > 1.15 ? 'warn' : 'good'} />
        </Section>
      )}
    </>
  )
}
