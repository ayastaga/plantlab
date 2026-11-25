/**
 * Check-up: reconcile what the owner sees on a real plant with what the
 * simulation says the entered conditions would cause.
 *
 * A photo or a symptom list alone cannot separate causes: a yellow lower leaf
 * fits overwatering, drought, low light and hunger equally. The conditions
 * narrow it down. Each stress the simulation predicts is scored by how strong
 * it is and by how many of the observed symptoms it would explain. Symptoms
 * no predicted stress explains are reported as unexplained, which usually
 * means pests, disease, or conditions that were entered wrongly.
 */
import { applyPatch, defaultConfig } from './defaults'
import { STRESS_LABELS, runSimulation } from './engine'
import { LIGHT_PRESETS } from './light'
import { recommend } from './recommend'
import { allSpecies } from './species'
import type { ExperimentConfig, Recommendation, SimulationResult, SpeciesProfile, StressKey, SymptomKey } from './types'

export const SYMPTOMS: Record<SymptomKey, { label: string; hint: string }> = {
  yellowLower: { label: 'Lower leaves yellowing', hint: 'oldest leaves first' },
  paleAll: { label: 'Pale or washed-out all over', hint: 'including new growth' },
  brownTips: { label: 'Brown, crispy tips or edges', hint: '' },
  brownPatches: { label: 'Brown or bleached patches', hint: 'in the middle of leaves' },
  drooping: { label: 'Drooping or wilting', hint: '' },
  leggy: { label: 'Leggy, stretched growth', hint: 'long gaps between leaves' },
  noGrowth: { label: 'No new growth for months', hint: 'in the growing season' },
  smallNewLeaves: { label: 'New leaves smaller than old', hint: '' },
  leafDrop: { label: 'Dropping leaves', hint: '' },
  mushyBase: { label: 'Soft, dark or mushy base', hint: 'or a sour smell from the pot' },
}

export const SYMPTOM_KEYS = Object.keys(SYMPTOMS) as SymptomKey[]

/** Symptoms each stress typically produces. General horticultural associations, not a validated key. */
const CAUSES: Record<StressKey, SymptomKey[]> = {
  lowLight: ['leggy', 'noGrowth', 'smallNewLeaves', 'yellowLower', 'leafDrop'],
  scorch: ['brownPatches', 'paleAll'],
  drought: ['drooping', 'brownTips', 'yellowLower', 'leafDrop'],
  waterlogging: ['yellowLower', 'drooping', 'mushyBase', 'leafDrop'],
  rootRot: ['yellowLower', 'drooping', 'mushyBase', 'leafDrop'],
  dryAir: ['brownTips'],
  cold: ['drooping', 'brownPatches', 'leafDrop'],
  heat: ['drooping', 'brownTips'],
  nutrientDeficiency: ['paleAll', 'noGrowth', 'smallNewLeaves', 'yellowLower'],
  saltBuildup: ['brownTips'],
  rootBound: ['drooping', 'noGrowth', 'smallNewLeaves'],
}

export interface Hypothesis {
  stress: StressKey
  label: string
  /** 0–1 relative likelihood among the listed hypotheses */
  weight: number
  /** How strongly the conditions produce this stress in simulation, 0–1 */
  predicted: number
  explains: SymptomKey[]
  /** Observed symptoms this cause would not produce */
  support: 'conditions and symptoms' | 'conditions only' | 'symptoms only'
}

export interface Diagnosis {
  hypotheses: Hypothesis[]
  unexplained: SymptomKey[]
  /** True when the conditions look fine but the plant shows symptoms */
  mismatch: boolean
  result: SimulationResult
  recommendations: Recommendation[]
}

export function diagnose(config: ExperimentConfig, symptoms: SymptomKey[], days = 90): Diagnosis {
  const result = runSimulation(config, days)
  const seen = new Set(symptoms)
  const hypotheses: Hypothesis[] = []

  for (const key of Object.keys(CAUSES) as StressKey[]) {
    const s = result.stresses.find((x) => x.key === key)
    const predicted = s ? Math.min(1, Math.max(s.mean, s.peak * 0.5)) : 0
    const explains = CAUSES[key].filter((x) => seen.has(x))
    const match = seen.size ? explains.length / seen.size : 0
    if (predicted < 0.05 && explains.length === 0) continue
    // conditions carry most of the weight; matching symptoms confirm, a pure symptom match is only a lead
    const weight = predicted >= 0.05 ? predicted * (seen.size ? 0.35 + 0.65 * match : 1) : 0.06 * match
    if (weight < 0.02) continue
    hypotheses.push({
      stress: key,
      label: STRESS_LABELS[key],
      weight,
      predicted,
      explains,
      support: predicted >= 0.05 ? (explains.length ? 'conditions and symptoms' : 'conditions only') : 'symptoms only',
    })
  }
  // root rot follows waterlogging; show whichever is stronger, not both
  const wl = hypotheses.find((h) => h.stress === 'waterlogging')
  const rr = hypotheses.find((h) => h.stress === 'rootRot')
  if (wl && rr) hypotheses.splice(hypotheses.indexOf(wl.weight >= rr.weight ? rr : wl), 1)

  hypotheses.sort((a, b) => b.weight - a.weight)
  const total = hypotheses.reduce((s, h) => s + h.weight, 0) || 1
  for (const h of hypotheses) h.weight = h.weight / total

  const explained = new Set(hypotheses.filter((h) => h.support !== 'symptoms only').flatMap((h) => h.explains))
  const unexplained = symptoms.filter((s) => !explained.has(s))
  return {
    hypotheses: hypotheses.slice(0, 5),
    unexplained,
    mismatch: symptoms.length > 0 && result.overall >= 80 && unexplained.length === symptoms.length,
    result,
    recommendations: recommend(config, result, 3),
  }
}

/* ---------- "what grows here": rank species for one spot ---------- */

export interface Spot {
  lightPresetId: string
  rh: number
  meanC: number
  minC: number
  petSafeOnly: boolean
}

export interface SpotMatch {
  species: SpeciesProfile
  config: ExperimentConfig
  result: SimulationResult
}

/** The spot's fixed conditions as a config patch. Care (watering, pot, mix) stays the species' own. */
export function spotPatch(spot: Spot) {
  const light = LIGHT_PRESETS.find((p) => p.id === spot.lightPresetId) ?? LIGHT_PRESETS[1]
  return {
    light: { ppfd: light.ppfd, hoursPerDay: light.hours, exposure: light.exposure },
    humidity: { ambientRh: spot.rh, humidifier: false },
    temperature: { meanC: spot.meanC, minC: Math.min(spot.minC, spot.meanC), maxC: Math.max(spot.meanC + 3, spot.minC) },
  }
}

/**
 * Simulate every species in the spot. Watering is fitted per species first
 * (one run to measure water use, then the schedule that fits), so the ranking
 * reflects the spot rather than a watering schedule nobody chose.
 */
export function rankForSpot(spot: Spot, days = 180): SpotMatch[] {
  const out: SpotMatch[] = []
  for (const species of allSpecies()) {
    if (spot.petSafeOnly && species.toxicToPets !== false) continue
    let config = applyPatch(defaultConfig(species.id), spotPatch(spot))
    const probe = runSimulation(config, 60)
    if (!config.medium.semiHydro.enabled) {
      config = applyPatch(config, {
        watering: { intervalDays: probe.derived.suggestedIntervalDays, amountMl: probe.derived.suggestedAmountMl },
      })
    }
    out.push({ species, config, result: runSimulation(config, days) })
  }
  return out.sort((a, b) => b.result.overall - a.result.overall)
}
