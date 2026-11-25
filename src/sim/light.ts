import type { ExperimentConfig } from './types'

/** DLI (mol·m⁻²·d⁻¹) from average PPFD (µmol·m⁻²·s⁻¹) over a photoperiod in hours. */
export function dli(ppfd: number, hours: number): number {
  return (ppfd * hours * 3600) / 1_000_000
}

export function sunDli(light: ExperimentConfig['light']): number {
  return dli(light.ppfd, light.hoursPerDay)
}

export function growDli(light: ExperimentConfig['light']): number {
  return light.growLights.reduce((s, g) => (g.enabled ? s + dli(g.ppfd, g.hoursPerDay) : s), 0)
}

export function totalDli(light: ExperimentConfig['light']): number {
  return sunDli(light) + growDli(light)
}

/**
 * Rough daylight conversion (≈54 lux per µmol·m⁻²·s⁻¹ for sunlight). For
 * orientation only: lux meters weight green light, PPFD counts photons.
 */
export function ppfdToLux(ppfd: number): number {
  return ppfd * 54
}

export interface LightPreset {
  id: string
  label: string
  note: string
  ppfd: number
  hours: number
  exposure: 'direct' | 'indirect'
}

/**
 * Typical indoor situations as canopy-level averages. Anchored to university
 * extension distance bands (within ~1.2 m of an unobstructed east, south or
 * west window: 300 fc or more; 1.2–3 m, or at a north window: 100–300 fc;
 * beyond 3 m: 25–100 fc), converted at 0.20 µmol·m⁻²·s⁻¹ per foot-candle of
 * daylight. Bands, not measurements: a reading from a light meter is better.
 */
export const LIGHT_PRESETS: LightPreset[] = [
  { id: 'far', label: 'Far from any window', note: '3 m or more, about 50 fc', ppfd: 10, hours: 10, exposure: 'indirect' },
  { id: 'mid', label: '1–3 m from a window', note: 'about 150 fc', ppfd: 30, hours: 10, exposure: 'indirect' },
  { id: 'north', label: 'At a north window', note: 'no direct sun, about 200 fc', ppfd: 40, hours: 10, exposure: 'indirect' },
  { id: 'near', label: 'Within 1 m of an east or west window', note: 'bright, about 500 fc', ppfd: 100, hours: 10, exposure: 'indirect' },
  { id: 'bright', label: 'Right at a bright filtered window', note: 'sheer curtain, about 1,400 fc', ppfd: 280, hours: 10, exposure: 'indirect' },
  { id: 'south', label: 'South window sill', note: 'hours of direct sun', ppfd: 800, hours: 5, exposure: 'direct' },
]

/** µmol·m⁻²·s⁻¹ per lux for daylight (1/54). White LEDs are 0.014–0.018 depending on colour temperature. */
export const PPFD_PER_LUX = 0.0185

/** Saturation vapour pressure, kPa (Tetens). */
export function svpKpa(tC: number): number {
  return 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3))
}

export function vpdKpa(tC: number, rh: number): number {
  return svpKpa(tC) * (1 - Math.max(0, Math.min(100, rh)) / 100)
}
