import { describe, expect, it } from 'vitest'
import { applyPatch, defaultConfig } from './defaults'
import { runSimulation } from './engine'
import { MEDIUM_PRESETS, mixTotal, setMixComponent } from './media'
import { recommend } from './recommend'
import type { DeepPartial, ExperimentConfig } from './types'

const preset = (id: string) => MEDIUM_PRESETS.find((p) => p.id === id)!
const cfg = (patch: DeepPartial<ExperimentConfig> = {}) => applyPatch(defaultConfig(), patch)

/** A setup a careful grower would aim for. */
const good = (patch: DeepPartial<ExperimentConfig> = {}) =>
  cfg(
    applyPatch(
      {
        light: { ppfd: 280, hoursPerDay: 10 },
        humidity: { ambientRh: 62 },
        temperature: { meanC: 24, minC: 20, maxC: 27 },
        medium: { mix: preset('aroid').mix },
        watering: { intervalDays: 5, amountMl: 700, feedIntervalDays: 14 },
      } as DeepPartial<ExperimentConfig>,
      patch,
    ),
  )

const summary = (label: string, c: ExperimentConfig, days = 180) => {
  const r = runSimulation(c, days)
  console.log(
    label.padEnd(26),
    `overall ${String(r.overall).padStart(3)}`,
    JSON.stringify(r.scores),
    `leaves +${r.growth.leavesGrown}/-${r.growth.leavesLost}`,
    `health ${r.growth.finalHealth}`,
    r.growth.survived ? '' : `DEAD d${r.growth.daysToDeath}`,
    r.stresses.map((s) => `${s.key}:${s.mean.toFixed(2)}`).join(' '),
  )
  return r
}

describe('simulation engine', () => {
  it('is deterministic', () => {
    const a = runSimulation(defaultConfig(), 180)
    const b = runSimulation(defaultConfig(), 180)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('good conditions thrive and grow', () => {
    const r = summary('good', good())
    expect(r.overall).toBeGreaterThanOrEqual(80)
    expect(r.growth.leavesGrown).toBeGreaterThanOrEqual(4)
    expect(r.growth.leavesLost).toBe(0)
  })

  it('default setup is workable but improvable', () => {
    const r = summary('default', defaultConfig())
    expect(r.overall).toBeGreaterThan(45)
    expect(r.overall).toBeLessThan(85)
    expect(r.growth.survived).toBe(true)
  })

  it('darkness starves the plant', () => {
    const r = summary('dark', good({ light: { ppfd: 10, hoursPerDay: 8 } }))
    expect(r.limitingFactor).toBe('light')
    expect(r.growth.leavesGrown).toBe(0)
    expect(r.growth.leavesLost).toBeGreaterThan(0)
    expect(r.overall).toBeLessThan(45)
  })

  it('direct scorching sun damages leaves', () => {
    const r = summary('scorch', good({ light: { ppfd: 1300, hoursPerDay: 8, exposure: 'direct' } }))
    expect(r.stresses.some((s) => s.key === 'scorch')).toBe(true)
    expect(r.overall).toBeLessThan(70)
    expect(r.snapshots.at(-1)!.leaves.some((l) => l.brown > 0.4)).toBe(true)
  })

  it('never watering kills by drought', () => {
    const r = summary('drought', good({ watering: { intervalDays: 60, amountMl: 100 } }))
    expect(r.stresses[0].key).toBe('drought')
    expect(r.overall).toBeLessThan(45)
  })

  it('daily heavy watering in dense soil without drainage rots roots', () => {
    const r = summary(
      'swamp',
      good({ medium: { mix: preset('potting').mix }, pot: { drainageHoles: false, material: 'ceramic' }, watering: { intervalDays: 2, amountMl: 700 } }),
    )
    expect(r.stresses.some((s) => s.key === 'rootRot')).toBe(true)
    expect(r.limitingFactor === 'water' || r.limitingFactor === 'medium').toBe(true)
    expect(r.overall).toBeLessThan(45)
  })

  it('same over-watering is far less harmful in a chunky mix with drainage', () => {
    const dense = runSimulation(good({ medium: { mix: preset('potting').mix }, watering: { intervalDays: 2, amountMl: 700 } }), 180)
    const chunky = summary('wet+chunky', good({ watering: { intervalDays: 2, amountMl: 700 } }))
    expect(chunky.scores.water).toBeGreaterThan(dense.scores.water + 10)
  })

  it('cold kills', () => {
    const r = summary('cold', good({ temperature: { meanC: 8, minC: 3, maxC: 12 } }))
    expect(r.limitingFactor).toBe('temperature')
    expect(r.growth.survived).toBe(false)
  })

  it('dry air browns tips but is survivable', () => {
    const r = summary('dry air', good({ humidity: { ambientRh: 22 } }))
    expect(r.growth.survived).toBe(true)
    expect(r.scores.humidity).toBeLessThan(80)
    expect(r.snapshots.at(-1)!.leaves[0].brown).toBeGreaterThan(0.1)
  })

  it('LECA semi-hydro works with nutrients and fails without', () => {
    const leca = { mix: preset('leca').mix, semiHydro: { enabled: true, reservoirPct: 25, nutrientStrengthPct: 50, flushIntervalDays: 14 } }
    const fed = summary('leca fed', good({ medium: leca, watering: { intervalDays: 5 }, pot: { material: 'glass', drainageHoles: false } }))
    const unfed = summary('leca plain water', good({ medium: { ...leca, semiHydro: { ...leca.semiHydro, nutrientStrengthPct: 0 } }, watering: { intervalDays: 5 } }))
    expect(fed.overall).toBeGreaterThanOrEqual(75)
    expect(unfed.overall).toBeLessThan(fed.overall - 10)
    expect(unfed.stresses.some((s) => s.key === 'nutrientDeficiency')).toBe(true)
  })

  it('LECA watered like soil (no reservoir) dries out', () => {
    const r = summary('leca no reservoir', good({ medium: { mix: preset('leca').mix } }))
    expect(r.stresses.some((s) => s.key === 'drought')).toBe(true)
  })

  it('soil sitting in a reservoir rots', () => {
    const r = summary('soil in reservoir', good({ medium: { mix: preset('potting').mix, semiHydro: { enabled: true } } }))
    expect(r.scores.water).toBeLessThan(40)
  })

  it('pot material changes drying rate; colour does not change anything', () => {
    const terracotta = runSimulation(good({ pot: { material: 'terracotta' } }), 60)
    const plastic = runSimulation(good({ pot: { material: 'plastic' } }), 60)
    expect(terracotta.derived.meanWaterUseMl).toBeGreaterThan(plastic.derived.meanWaterUseMl)
    const recoloured = runSimulation(good({ pot: { material: 'terracotta', color: '#123456' } }), 60)
    expect(recoloured.overall).toBe(terracotta.overall)
    expect(recoloured.derived.meanWaterUseMl).toBe(terracotta.derived.meanWaterUseMl)
  })

  it('tiny pot becomes root-bound', () => {
    const r = summary('tiny pot', good({ pot: { widthCm: 10, heightCm: 9 }, watering: { intervalDays: 3, amountMl: 150 } }), 365)
    expect(r.stresses.some((s) => s.key === 'rootBound')).toBe(true)
  })

  it('recommendations improve the score when applied', () => {
    const c = cfg({ light: { ppfd: 8 }, humidity: { ambientRh: 30 } })
    const r = summary('poor', c, 90)
    const recs = recommend(c, r)
    console.log(recs.map((x) => `${x.title} (+${x.scoreDelta})`).join(' | '))
    expect(recs.length).toBeGreaterThan(0)
    expect(recs[0].scoreDelta).toBeGreaterThanOrEqual(recs[recs.length - 1].scoreDelta)
    const after = runSimulation(applyPatch(c, recs[0].patch), 90)
    expect(after.overall).toBe(recs[0].newOverall)
    expect(after.overall).toBeGreaterThan(r.overall)
  })

  it('mix editing always totals 100', () => {
    let m = preset('aroid').mix
    m = setMixComponent(m, 'leca', 37)
    expect(mixTotal(m)).toBe(100)
    m = setMixComponent(m, 'pottingSoil', 100)
    expect(mixTotal(m)).toBe(100)
    m = setMixComponent(m, 'pottingSoil', 20)
    expect(mixTotal(m)).toBe(100)
  })

  it('prints a year of the good setup', () => {
    const r = summary('good 365', good(), 365)
    expect(r.growth.survived).toBe(true)
  })
})
