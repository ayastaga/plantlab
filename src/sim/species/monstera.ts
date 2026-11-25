import type { SpeciesProfile } from '../types'

/**
 * Monstera deliciosa profile.
 *
 * These are working ranges assembled from general horticultural guidance for a
 * tropical hemi-epiphytic aroid grown indoors (bright indirect light, warm,
 * moderately humid, airy free-draining substrate, dries partially between
 * waterings). They are deliberately round numbers: they are modelling
 * assumptions, not measured thresholds, and the model is not validated
 * against growth trials.
 */
export const monstera: SpeciesProfile = {
  id: 'monstera-deliciosa',
  commonName: 'Monstera',
  scientificName: 'Monstera deliciosa',
  archetype: 'Tropical climbing aroid',
  source: 'curated',
  confidence: 'medium',
  toxicToPets: true,
  summary:
    'Tropical climbing aroid from Central American forest understories. Wants bright filtered light, warmth, moderate-to-high humidity and a chunky, airy root zone that dries partway between waterings.',
  habit: 'climber',
  leaf: {
    shape: 'cordate',
    aspect: 1,
    fenestration: 1,
    color: '#2d6a35',
    newColor: '#5f9c3f',
    edgeColor: null,
    stiffness: 0.3,
    petioleRatio: 0.72,
    internodeCm: 2,
  },
  starter: {},
  light: { dliMin: 0.4, dliLow: 1, dliOptLow: 5, dliOptHigh: 14, dliHigh: 24, scorchPpfd: 600 },
  temperature: { lethalMinC: 2, damageMinC: 10, growthMinC: 13, optLowC: 20, optHighC: 29, growthMaxC: 35, heatStressC: 33 },
  humidity: { stressBelowRh: 30, severeBelowRh: 12, optLowRh: 45, optHighRh: 85 },
  water: { droughtStartTheta: 0.3, rewaterTheta: 0.4, airNeed: 0.2, droughtHardiness: 0.15 },
  medium: { airPorosityOpt: 0.25 },
  growth: {
    leafIntervalDays: 28,
    leafExpansionDays: 21,
    juvenileLeafCm: 12,
    matureLeafCm: 48,
    maxLeaves: 22,
    transpirationMlPerM2: 350,
    rootVolumeLPerM2: 9,
  },
  assumptions: [
    'Light is evaluated as daily light integral (DLI = PPFD × hours × 0.0036). Maintenance level about 1 mol·m⁻²·d⁻¹ (between the 75 and 150 foot-candle interior minimums extension tables give for comparable aroids); near-full growth from about 5. No Monstera-specific measurements were found, so this placement is an assumption.',
    'Unfiltered direct sun above roughly 600 µmol·m⁻²·s⁻¹ is treated as a leaf-scorch risk. Acclimation is not modelled.',
    'Temperature: best growth about 20–29 °C, growth stalls near 13 °C, chilling injury below about 10 °C. Typical guidance for tropical aroids.',
    'Humidity: treated as a mild modifier. Extension guidance rates Monstera as tolerating average home humidity (25–49 %); higher humidity improves growth. No dose-response data exist.',
    'Roots are assumed to need about 20 % air-filled pore space; sustained saturation causes hypoxia and root rot.',
    'A new leaf roughly every 4 weeks under ideal indoor conditions; leaf size and fenestration increase with maturity and light.',
    'Water use scales with leaf area, light and vapour-pressure deficit using a single reference coefficient. It is an estimate, not a measurement.',
  ],
}
