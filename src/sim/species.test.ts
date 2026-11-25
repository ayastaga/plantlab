import { describe, expect, it } from 'vitest'
import { applyPatch, defaultConfig } from './defaults'
import { diagnose, rankForSpot } from './diagnose'
import { runSimulation } from './engine'
import { curatedSpecies, sanitizeProfile } from './species'

describe('species library', () => {
  it('every curated species does well in conditions suited to it, with fitted watering', () => {
    for (const sp of curatedSpecies()) {
      const ppfd = Math.round((((sp.light.dliOptLow + sp.light.dliOptHigh) / 2) * 1e6) / (10 * 3600))
      let c = applyPatch(defaultConfig(sp.id), {
        light: { ppfd, hoursPerDay: 10, exposure: 'indirect' },
        humidity: { ambientRh: Math.round((sp.humidity.optLowRh + sp.humidity.optHighRh) / 2) },
        temperature: { meanC: 23, minC: 19, maxC: 27 },
        watering: { feedIntervalDays: 21 },
      })
      const probe = runSimulation(c, 60)
      c = applyPatch(c, { watering: { intervalDays: probe.derived.suggestedIntervalDays, amountMl: probe.derived.suggestedAmountMl } })
      const r = runSimulation(c, 180)
      console.log(sp.commonName.padEnd(24), r.overall, JSON.stringify(r.scores), `+${r.growth.leavesGrown}/-${r.growth.leavesLost}`, `water ${probe.derived.suggestedAmountMl}ml/${probe.derived.suggestedIntervalDays}d`, r.stresses.map((s) => `${s.key}:${s.mean.toFixed(2)}`).join(' '))
      expect(r.growth.survived, sp.commonName).toBe(true)
      expect(r.overall, sp.commonName).toBeGreaterThanOrEqual(75)
    }
  })

  it('species differ where they should', () => {
    const dim = { light: { ppfd: 20, hoursPerDay: 10 } }
    const snake = runSimulation(applyPatch(defaultConfig('dracaena-trifasciata'), dim), 180)
    const fig = runSimulation(applyPatch(defaultConfig('ficus-lyrata'), dim), 180)
    expect(snake.scores.light).toBeGreaterThan(fig.scores.light + 10)

    const neglect = { watering: { intervalDays: 30, amountMl: 200 } }
    const zz = runSimulation(applyPatch(defaultConfig('zamioculcas-zamiifolia'), neglect), 120)
    const lily = runSimulation(applyPatch(defaultConfig('spathiphyllum'), neglect), 120)
    expect(zz.scores.water).toBeGreaterThan(lily.scores.water + 20)
  })

  it('ranks shade plants above sun plants in a dim spot, and respects the pet filter', () => {
    const ranked = rankForSpot({ lightPresetId: 'north', rh: 40, meanC: 21, minC: 17, petSafeOnly: false })
    console.log(ranked.map((m) => `${m.species.commonName} ${m.result.overall}`).join(' | '))
    const pos = (id: string) => ranked.findIndex((m) => m.species.id === id)
    expect(pos('dracaena-trifasciata')).toBeLessThan(pos('ficus-lyrata'))
    expect(pos('epipremnum-aureum')).toBeLessThan(pos('echeveria'))
    const safe = rankForSpot({ lightPresetId: 'north', rh: 40, meanC: 21, minC: 17, petSafeOnly: true })
    expect(safe.length).toBeGreaterThan(0)
    expect(safe.every((m) => m.species.toxicToPets === false)).toBe(true)
  })

  it('check-up ranks the cause that fits both conditions and symptoms', () => {
    const wet = applyPatch(defaultConfig(), { watering: { intervalDays: 2, amountMl: 700 }, pot: { drainageHoles: false, material: 'ceramic' } })
    const dx = diagnose(wet, ['yellowLower', 'mushyBase'])
    console.log(dx.hypotheses.map((h) => `${h.stress} ${(h.weight * 100).toFixed(0)}% [${h.support}]`).join(' | '))
    expect(['waterlogging', 'rootRot']).toContain(dx.hypotheses[0].stress)
    expect(dx.unexplained).toEqual([])

    // good conditions + symptoms → flagged as unexplained rather than forced into a cause
    const fine = applyPatch(defaultConfig(), { light: { ppfd: 280 }, humidity: { ambientRh: 62 }, watering: { intervalDays: 6, amountMl: 650, feedIntervalDays: 14 } })
    const odd = diagnose(fine, ['brownPatches'])
    expect(odd.unexplained).toContain('brownPatches')
  })

  it('sanitises hostile or nonsensical AI profiles', () => {
    const p = sanitizeProfile({ commonName: 'X', light: { dliMin: 99, dliOptLow: -5, dliOptHigh: 'lots' }, temperature: { optLowC: 80, lethalMinC: -400 }, leaf: { aspect: 50, color: 'red' }, habit: 'tree', toxicToPets: 'no' })
    expect(p.light.dliMin).toBeLessThan(p.light.dliLow)
    expect(p.light.dliOptLow).toBeLessThan(p.light.dliOptHigh)
    expect(p.temperature.optLowC).toBeLessThan(p.temperature.optHighC)
    expect(p.leaf.aspect).toBeLessThanOrEqual(1.3)
    expect(p.habit).toBe('rosette')
    expect(p.toxicToPets).toBeNull()
    expect(p.source).toBe('ai')
    const r = runSimulation(applyPatch(defaultConfig(), { speciesId: p.id }), 30)
    expect(Number.isFinite(r.overall)).toBe(true)
  })
})
