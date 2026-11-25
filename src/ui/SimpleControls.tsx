import { ArrowRight, Check, Wand2 } from 'lucide-react'
import { derive } from '../sim/engine'
import { LIGHT_PRESETS } from '../sim/light'
import { MEDIUM_PRESETS, matchPreset } from '../sim/media'
import { getSpecies } from '../sim/species'
import type { StressKey } from '../sim/types'
import { useLab, useSnapshot } from '../store/useLab'
import { SpeciesBadges } from './Garden'

const AIR = [
  { rh: 25, label: 'Dry', note: 'heated or air-conditioned room' },
  { rh: 45, label: 'Average', note: 'typical home' },
  { rh: 65, label: 'Humid', note: 'bathroom, or a humidifier' },
]
const WARMTH = [
  { mean: 15, label: 'Cool', note: 'around 15 °C' },
  { mean: 21, label: 'Room', note: 'around 21 °C' },
  { mean: 27, label: 'Warm', note: 'around 27 °C' },
  { mean: 34, label: 'Hot', note: 'around 34 °C' },
]
const SOILS = ['potting', 'aroid', 'cactus', 'leca']
const FEEDS = [
  { days: 0, label: 'Never' },
  { days: 28, label: 'Monthly' },
  { days: 14, label: 'Every 2 weeks' },
]

/** What each stress looks like to someone who has never heard its name. */
const PLAIN: Record<StressKey, string> = {
  lowLight: 'It is not getting enough light to grow.',
  scorch: 'Direct sun is burning the leaves.',
  drought: 'It dries out too much between waterings.',
  waterlogging: 'The soil stays too wet, so the roots cannot breathe.',
  rootRot: 'The roots are rotting from sitting wet.',
  dryAir: 'The air is too dry for it.',
  cold: 'It is getting too cold.',
  heat: 'It is getting too hot.',
  nutrientDeficiency: 'It is running out of nutrients.',
  saltBuildup: 'Fertiliser salts are building up in the pot.',
  rootBound: 'It has outgrown its pot.',
}

function mood(health: number, alive: boolean): { word: string; color: string } {
  if (!alive) return { word: 'Would not survive', color: 'var(--color-rust)' }
  if (health >= 80) return { word: 'Thriving', color: 'var(--color-forest)' }
  if (health >= 62) return { word: 'Doing fine', color: 'var(--color-forest)' }
  if (health >= 42) return { word: 'Struggling', color: 'var(--color-amber)' }
  return { word: 'Declining', color: 'var(--color-rust)' }
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold leading-tight">{title}</h3>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Chips<T extends string | number>({ value, options, onChange, columns }: { value: T | null; options: { value: T; label: string; note?: string }[]; onChange: (v: T) => void; columns?: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-[8px] border px-2 py-1.5 text-left transition-colors ${o.value === value ? 'border-forest bg-forest-soft' : 'border-line bg-surface hover:border-line-strong'}`}
        >
          <span className="block text-[12.5px] font-medium leading-tight">{o.label}</span>
          {o.note && <span className="block text-[10.5px] leading-tight text-ink-3">{o.note}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * The simple editor: everyday questions instead of instrument readings. Every
 * choice writes the same experiment config the full workstation edits, and the
 * plant is re-simulated after each change.
 */
export function SimpleControls() {
  const experiment = useLab((s) => s.experiment)
  const config = experiment.config
  const update = useLab((s) => s.update)
  const recommendations = useLab((s) => s.recommendations)
  const apply = useLab((s) => s.applyRecommendation)
  const select = useLab((s) => s.select)
  const day = useLab((s) => s.day)
  const result = useLab((s) => s.result)
  const snap = useSnapshot()
  const sp = getSpecies(config.speciesId)
  const d = derive(config)

  const m = mood(snap.health, snap.alive)
  const stresses = (Object.keys(snap.stress) as StressKey[]).filter((k) => snap.stress[k] > 0.15).sort((a, b) => snap.stress[b] - snap.stress[a])
  // root rot is the consequence of waterlogging; say it once
  const shown = stresses.filter((k) => !(k === 'waterlogging' && stresses.includes('rootRot'))).slice(0, 2)
  const light = LIGHT_PRESETS.find((p) => p.ppfd === config.light.ppfd && p.hours === config.light.hoursPerDay && p.exposure === config.light.exposure)
  const soil = matchPreset(config.medium.mix, config.medium.semiHydro.enabled)
  const semi = config.medium.semiHydro.enabled
  const dose = (interval: number) => Math.max(50, Math.round((d.capacityMl * Math.min(0.75, 0.3 + interval * 0.03)) / 50) * 50)

  return (
    <>
      <div className="border-b border-line px-4 py-3">
        <div className="text-[19px] font-semibold leading-tight">{experiment.name}</div>
        <div className="text-[12px] italic text-ink-3">{sp.scientificName}</div>
        <div className="mt-1.5 flex flex-wrap gap-1"><SpeciesBadges sp={sp} /></div>
      </div>
        <section className="border-b border-line px-4 py-3.5">
          <div className="label-caps mb-1">{day > 0 ? `Day ${Math.floor(day)}` : 'Today'}{result ? ` of ${result.durationDays}` : ''}</div>
          <div className="flex items-baseline justify-between">
            <span className="text-[22px] font-semibold leading-tight" style={{ color: m.color }}>{m.word}</span>
            <span className="num text-[12px] text-ink-2">{snap.alive ? `${Math.round(snap.health)} % health · ${snap.leaves.length} leaves` : 'no leaves left'}</span>
          </div>
          <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${snap.health}%`, background: m.color }} />
          </div>
          {day > 0 && shown.length === 0 && snap.alive && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-2"><Check size={14} className="mt-0.5 shrink-0 text-forest" /> Nothing is holding it back in these conditions.</p>
          )}
          {day > 0 && shown.map((k) => (
            <p key={k} className="mt-2 text-[12.5px] leading-snug">{PLAIN[k]}</p>
          ))}
          {day <= 0 && <p className="mt-2 text-[12.5px] leading-snug text-ink-2">This is the plant as it starts. Press play below, or drag the timeline, to see where these conditions take it.</p>}
          {result && <p className="mt-2 text-[12px] text-ink-2">Over the whole run: <span className="font-semibold">{result.verdict}</span> <span className="num">({result.overall}/100)</span></p>}
        </section>

        {recommendations.length > 0 && (
          <section className="border-b border-line bg-forest-soft/50 px-4 py-3.5">
            <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold"><Wand2 size={14} className="text-forest" /> Best thing to try</h3>
            <p className="mt-1 text-[12.5px] font-medium leading-snug">{recommendations[0].title}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-2">The single change that helps most, tested by re-running the plant with it.</p>
            <button type="button" onClick={() => apply(recommendations[0])} className="mt-2 flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 text-[12.5px] font-medium text-surface hover:bg-forest-deep">
              Try it <ArrowRight size={13} />
            </button>
          </section>
        )}

        <Group title="Where does it sit?" hint="Light matters most, and is the easiest thing to misjudge.">
          <Chips
            columns={1}
            value={light?.id ?? null}
            options={LIGHT_PRESETS.map((p) => ({ value: p.id, label: p.label, note: p.note }))}
            onChange={(id) => {
              const p = LIGHT_PRESETS.find((x) => x.id === id)!
              update((c) => {
                c.light.ppfd = p.ppfd
                c.light.hoursPerDay = p.hours
                c.light.exposure = p.exposure
              })
            }}
          />
        </Group>

        <Group title={semi ? 'How often do you top up the water?' : 'How often do you water?'}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              className="slider flex-1"
              aria-label="Days between watering"
              min={2}
              max={30}
              step={1}
              value={config.watering.intervalDays}
              style={{ '--fill': `${((config.watering.intervalDays - 2) / 28) * 100}%` } as React.CSSProperties}
              onChange={(e) => {
                const days = parseInt(e.target.value)
                update((c) => {
                  c.watering.intervalDays = days
                  c.watering.amountMl = dose(days)
                }, 'simple-water')
              }}
            />
            <span className="w-[92px] shrink-0 text-right text-[12.5px] font-medium">every {config.watering.intervalDays} days</span>
          </div>
          {!semi && <p className="mt-1 text-[11.5px] text-ink-3">About {config.watering.amountMl} ml each time, a proper soak for this pot.</p>}
        </Group>

        <Group title="How is the air?">
          <Chips value={AIR.find((a) => a.rh === config.humidity.ambientRh && !config.humidity.humidifier)?.rh ?? null} options={AIR.map((a) => ({ value: a.rh, label: a.label, note: a.note }))} onChange={(rh) => update((c) => { c.humidity.ambientRh = rh; c.humidity.humidifier = false })} />
        </Group>

        <Group title="How warm is the room?">
          <Chips
            value={WARMTH.find((w) => w.mean === config.temperature.meanC)?.mean ?? null}
            options={WARMTH.map((w) => ({ value: w.mean, label: w.label, note: w.note }))}
            onChange={(mean) => update((c) => { c.temperature.meanC = mean; c.temperature.minC = mean - 4; c.temperature.maxC = mean + 4 })}
          />
        </Group>

        <Group title="What is it planted in?">
          <Chips
            columns={2}
            value={soil?.id ?? null}
            options={SOILS.map((id) => MEDIUM_PRESETS.find((p) => p.id === id)!).map((p) => ({ value: p.id, label: p.label, note: p.semiHydro ? 'clay balls over water' : p.note }))}
            onChange={(id) => {
              const p = MEDIUM_PRESETS.find((x) => x.id === id)!
              update((c) => { c.medium.mix = { ...p.mix }; c.medium.semiHydro.enabled = p.semiHydro })
            }}
          />
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={config.pot.drainageHoles} onChange={(e) => update((c) => void (c.pot.drainageHoles = e.target.checked))} className="h-3.5 w-3.5 accent-[var(--color-forest)]" />
            The pot has drainage holes
          </label>
          <div className="mt-2.5 flex items-center gap-3">
            <span className="text-[12.5px] text-ink-2">Pot size</span>
            <input
              type="range"
              className="slider flex-1"
              aria-label="Pot width"
              min={8}
              max={40}
              step={1}
              value={config.pot.widthCm}
              style={{ '--fill': `${((config.pot.widthCm - 8) / 32) * 100}%` } as React.CSSProperties}
              onChange={(e) => {
                const w = parseInt(e.target.value)
                update((c) => { c.pot.widthCm = w; c.pot.heightCm = Math.round(w * 0.87) }, 'simple-pot')
              }}
            />
            <span className="w-[56px] shrink-0 text-right text-[12.5px] font-medium">{config.pot.widthCm} cm</span>
          </div>
        </Group>

        {!semi && (
          <Group title="Do you feed it?">
            <Chips value={FEEDS.find((f) => f.days === config.watering.feedIntervalDays)?.days ?? null} options={FEEDS.map((f) => ({ value: f.days, label: f.label }))} onChange={(days) => update((c) => { c.watering.feedIntervalDays = days; c.watering.feedStrengthPct = 50 })} />
          </Group>
        )}

        <div className="px-4 py-4">
          <p className="text-[11.5px] leading-snug text-ink-2">Need exact numbers? Click a tool on the bench, or open one here:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([['sun', 'Sunlight'], ['watering', 'Watering'], ['atmosphere', 'Humidity'], ['temperature', 'Temperature'], ['pot', 'Pot'], ['medium', 'Soil'], ['plant', 'Plant']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => select(id)} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] hover:border-forest hover:text-forest">
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-3">An estimate from a simplified model, not a promise.</p>
        </div>
    </>
  )
}
