import type { GrowthHabit, LeafShape, SpeciesProfile } from '../types'
import { LIBRARY } from './library'
import { monstera } from './monstera'

/**
 * Species registry: the curated library plus any user-added (AI-estimated)
 * profiles. The engine and renderer read everything from the profile, so a new
 * plant is data, not code.
 */
const registry = new Map<string, SpeciesProfile>(LIBRARY.map((s) => [s.id, s]))

export function getSpecies(id: string): SpeciesProfile {
  return registry.get(id) ?? registry.get(monstera.id)!
}

export function allSpecies(): SpeciesProfile[] {
  return [...registry.values()]
}

export function curatedSpecies(): SpeciesProfile[] {
  return LIBRARY
}

export function registerSpecies(profile: SpeciesProfile) {
  registry.set(profile.id, profile)
}

export function unregisterSpecies(id: string) {
  if (!LIBRARY.some((s) => s.id === id)) registry.delete(id)
}

/** Offline name lookup against the registry. */
export function searchSpecies(query: string): SpeciesProfile[] {
  const q = query.trim().toLowerCase()
  if (!q) return allSpecies()
  const words = q.split(/\s+/)
  return allSpecies()
    .map((s) => {
      const hay = `${s.commonName} ${s.scientificName} ${s.archetype}`.toLowerCase()
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) + (hay.includes(q) ? 2 : 0)
      return { s, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s)
}

const HABITS: GrowthHabit[] = ['climber', 'cane', 'rosette', 'trailing']
const SHAPES: LeafShape[] = ['cordate', 'ovate', 'lanceolate', 'strap', 'round']
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(hi, Math.max(lo, n))
}
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback)

/**
 * Clamp and order an untrusted profile (model output or old saved data) so the
 * engine can never be handed impossible numbers. Missing fields fall back to
 * the Monstera baseline.
 */
export function sanitizeProfile(raw: Record<string, any>): SpeciesProfile {
  const b = monstera
  const L = raw.light ?? {}
  const T = raw.temperature ?? {}
  const H = raw.humidity ?? {}
  const W = raw.water ?? {}
  const G = raw.growth ?? {}
  const F = raw.leaf ?? {}

  const dliMin = num(L.dliMin, 0.1, 15, b.light.dliMin)
  const dliLow = Math.max(dliMin + 0.3, num(L.dliLow, 0.3, 20, b.light.dliLow))
  const dliOptLow = Math.max(dliLow + 0.5, num(L.dliOptLow, 1, 30, b.light.dliOptLow))
  const dliOptHigh = Math.max(dliOptLow + 1, num(L.dliOptHigh, 3, 50, b.light.dliOptHigh))
  const dliHigh = Math.max(dliOptHigh + 2, num(L.dliHigh, 6, 70, b.light.dliHigh))

  const lethalMinC = num(T.lethalMinC, -10, 12, b.temperature.lethalMinC)
  const damageMinC = Math.max(lethalMinC + 2, num(T.damageMinC, -5, 16, b.temperature.damageMinC))
  const growthMinC = Math.max(damageMinC + 1, num(T.growthMinC, 2, 20, b.temperature.growthMinC))
  const optLowC = Math.max(growthMinC + 2, num(T.optLowC, 10, 28, b.temperature.optLowC))
  const optHighC = Math.max(optLowC + 3, num(T.optHighC, 18, 35, b.temperature.optHighC))
  const heatStressC = Math.max(optHighC + 2, num(T.heatStressC, 26, 42, b.temperature.heatStressC))
  const growthMaxC = Math.max(heatStressC, num(T.growthMaxC, 28, 45, b.temperature.growthMaxC))

  const severeBelowRh = num(H.severeBelowRh, 0, 50, b.humidity.severeBelowRh)
  const stressBelowRh = Math.max(severeBelowRh + 5, num(H.stressBelowRh, 5, 65, b.humidity.stressBelowRh))
  const optLowRh = Math.max(stressBelowRh, num(H.optLowRh, 15, 75, b.humidity.optLowRh))
  const optHighRh = Math.max(optLowRh + 10, num(H.optHighRh, 45, 95, b.humidity.optHighRh))

  const juvenileLeafCm = num(G.juvenileLeafCm, 1, 60, b.growth.juvenileLeafCm)
  const id = String(raw.id || `custom-${String(raw.scientificName || raw.commonName || 'plant').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)

  return {
    id,
    commonName: String(raw.commonName || 'Unknown plant').slice(0, 60),
    scientificName: String(raw.scientificName || '').slice(0, 80),
    archetype: String(raw.archetype || 'Houseplant').slice(0, 60),
    summary: String(raw.summary || '').slice(0, 400),
    source: raw.source === 'curated' ? 'curated' : 'ai',
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
    toxicToPets: typeof raw.toxicToPets === 'boolean' ? raw.toxicToPets : null,
    habit: HABITS.includes(raw.habit) ? raw.habit : 'rosette',
    leaf: {
      shape: SHAPES.includes(F.shape) ? F.shape : 'ovate',
      aspect: num(F.aspect, 0.04, 1.3, 0.5),
      fenestration: num(F.fenestration, 0, 1, 0),
      color: hex(F.color, b.leaf.color),
      newColor: hex(F.newColor, b.leaf.newColor),
      edgeColor: F.edgeColor ? hex(F.edgeColor, '#d8d4a8') : null,
      stiffness: num(F.stiffness, 0, 1, 0.4),
      petioleRatio: num(F.petioleRatio, 0, 1.5, 0.3),
      internodeCm: num(F.internodeCm, 0.1, 12, 2),
    },
    starter: typeof raw.starter === 'object' && raw.starter ? raw.starter : {},
    light: { dliMin, dliLow, dliOptLow, dliOptHigh, dliHigh, scorchPpfd: num(L.scorchPpfd, 150, 2200, b.light.scorchPpfd) },
    temperature: { lethalMinC, damageMinC, growthMinC, optLowC, optHighC, growthMaxC, heatStressC },
    humidity: { stressBelowRh, severeBelowRh, optLowRh, optHighRh },
    water: {
      droughtStartTheta: num(W.droughtStartTheta, 0.05, 0.5, b.water.droughtStartTheta),
      rewaterTheta: num(W.rewaterTheta, 0.05, 0.65, b.water.rewaterTheta),
      airNeed: num(W.airNeed, 0.1, 0.32, b.water.airNeed),
      droughtHardiness: num(W.droughtHardiness, 0, 1, b.water.droughtHardiness),
    },
    medium: { airPorosityOpt: num(raw.medium?.airPorosityOpt, 0.12, 0.35, b.medium.airPorosityOpt) },
    growth: {
      leafIntervalDays: num(G.leafIntervalDays, 5, 120, b.growth.leafIntervalDays),
      leafExpansionDays: num(G.leafExpansionDays, 5, 60, b.growth.leafExpansionDays),
      juvenileLeafCm,
      matureLeafCm: Math.max(juvenileLeafCm + 1, num(G.matureLeafCm, 2, 120, b.growth.matureLeafCm)),
      maxLeaves: Math.round(num(G.maxLeaves, 6, 40, b.growth.maxLeaves)),
      transpirationMlPerM2: num(G.transpirationMlPerM2, 60, 600, b.growth.transpirationMlPerM2),
      rootVolumeLPerM2: num(G.rootVolumeLPerM2, 5, 40, b.growth.rootVolumeLPerM2),
    },
    assumptions: Array.isArray(raw.assumptions) && raw.assumptions.length ? raw.assumptions.map(String).slice(0, 8) : [
      'Every threshold in this profile was estimated by an AI model from general knowledge of the species. None of it has been checked against a horticultural source.',
      'Treat scores for this plant as a rough guide. Confirm the identification and compare against a trusted care reference.',
    ],
  }
}
