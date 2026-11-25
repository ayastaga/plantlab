import { MEDIUM_PRESETS } from './media'
import { POT_MATERIALS } from './pots'
import { getSpecies } from './species'
import type { DeepPartial, Experiment, ExperimentConfig, GrowLight } from './types'

/** Generic baseline, with the species' own starter setup (pot, mix, watering) layered on top. */
export function defaultConfig(speciesId = 'monstera-deliciosa'): ExperimentConfig {
  const base = baseConfig()
  base.speciesId = speciesId
  return applyPatch(base, getSpecies(speciesId).starter)
}

function baseConfig(): ExperimentConfig {
  return {
    version: 1,
    seed: 7,
    environmentMode: 'studio',
    speciesId: 'monstera-deliciosa',
    plant: { initialLeafCount: 6, initialHealth: 90 },
    light: {
      // a typical room position, 1–3 m from a window
      ppfd: 30,
      hoursPerDay: 10,
      exposure: 'indirect',
      azimuthDeg: 135,
      elevationDeg: 48,
      colorK: 5600,
      growLights: [],
    },
    humidity: { ambientRh: 40, fluctuation: 5, humidifier: false, targetRh: 60 },
    temperature: { meanC: 22, minC: 18, maxC: 26, fluctuationC: 1.5 },
    watering: { intervalDays: 7, amountMl: 600, method: 'top', feedIntervalDays: 28, feedStrengthPct: 50 },
    pot: {
      material: 'terracotta',
      shape: 'tapered',
      heightCm: 19,
      widthCm: 22,
      color: POT_MATERIALS.terracotta.defaultColor,
      drainageHoles: true,
    },
    medium: {
      mix: { ...MEDIUM_PRESETS[0].mix },
      semiHydro: { enabled: false, reservoirPct: 25, nutrientStrengthPct: 50, flushIntervalDays: 14 },
    },
    names: {},
  }
}

export function newGrowLight(index: number): GrowLight {
  return {
    id: `gl-${Date.now().toString(36)}-${index}`,
    name: `Grow light ${index + 1}`,
    enabled: true,
    ppfd: 150,
    hoursPerDay: 12,
    colorK: 4000,
  }
}

export function newExperiment(name = 'Untitled experiment', speciesId = 'monstera-deliciosa'): Experiment {
  const now = Date.now()
  return {
    id: `exp-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    createdAt: now,
    updatedAt: now,
    durationDays: 90,
    config: defaultConfig(speciesId),
  }
}

export const DURATIONS = [
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
]

/** Recursively merge a partial config into a config (arrays are replaced). */
export function applyPatch<T>(base: T, patch: DeepPartial<NoInfer<T>>): T {
  if (patch === undefined || patch === null) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] = applyPatch((base as Record<string, unknown>)[k], v as never)
  }
  return out as T
}

/** Fill in anything missing from a stored config so old saves keep loading. */
export function normalizeConfig(c: DeepPartial<ExperimentConfig> | undefined): ExperimentConfig {
  return applyPatch(defaultConfig(c?.speciesId), (c ?? {}) as DeepPartial<ExperimentConfig>)
}
