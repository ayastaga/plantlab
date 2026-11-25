/**
 * AI plant intake: identify a plant from a name/description or a photo, read
 * any visible symptoms, and map it onto the curated library where possible.
 *
 * The model's output is treated as an untrusted estimate:
 *  - a curated library match is always preferred over invented numbers
 *  - a generated profile is clamped by sanitizeProfile and labelled 'ai'
 *  - pet toxicity is never taken from the model
 *  - the user confirms the identification before anything is added
 *
 * The call goes straight from the browser to the Anthropic API with the user's
 * own key (stored only in this browser). A shipped product should proxy this
 * through a backend instead of holding a key client-side.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { SYMPTOM_KEYS } from '../sim/diagnose'
import { curatedSpecies, getSpecies, sanitizeProfile } from '../sim/species'
import type { SpeciesProfile, SymptomKey } from '../sim/types'

const MODEL = 'claude-opus-5-5'

const ProfileSchema = z.object({
  archetype: z.string().describe('Short care-group label, e.g. "Trailing aroid", "Desert succulent"'),
  summary: z.string().describe('Two sentences on origin and what the plant wants indoors'),
  habit: z.enum(['climber', 'cane', 'rosette', 'trailing']).describe('climber: leaves on long petioles from a short climbing stem; cane: upright woody stem with leaves along it; rosette: leaves from the base; trailing: vines hanging over the pot'),
  leaf: z.object({
    shape: z.enum(['cordate', 'ovate', 'lanceolate', 'strap', 'round']),
    aspect: z.number().describe('Blade width divided by length, 0.04 to 1.3'),
    fenestration: z.number().describe('0 for entire leaves, up to 1 for deeply split leaves'),
    color: z.string().describe('Mature leaf colour as #rrggbb'),
    newColor: z.string().describe('New leaf colour as #rrggbb'),
    edgeColor: z.string().nullable().describe('Margin colour as #rrggbb if variegated at the edge, else null'),
    stiffness: z.number().describe('0 soft and arching to 1 rigid and upright'),
    petioleRatio: z.number().describe('Petiole length as a multiple of blade length, 0 if none'),
    internodeCm: z.number().describe('Typical stem length between leaves, cm'),
  }),
  light: z.object({
    dliMin: z.number().describe('Daily light integral (mol/m2/day) below which it declines quickly. Interior reference: tolerant foliage plants about 0.3, most others 0.6, succulents 2'),
    dliLow: z.number().describe('DLI at which an acclimatized plant holds but barely grows. Interior reference: about 0.65 (75 foot-candle group), 1.3 (150 foot-candle group), 4 (succulents)'),
    dliOptLow: z.number().describe('DLI where growth is near full: about 4 for shade foliage, 6-8 for trees, 12 for succulents'),
    dliOptHigh: z.number(),
    dliHigh: z.number().describe('Upper tolerable DLI'),
    scorchPpfd: z.number().describe('Unfiltered direct PPFD (umol/m2/s) above which leaves scorch'),
  }),
  temperature: z.object({
    lethalMinC: z.number(),
    damageMinC: z.number(),
    growthMinC: z.number(),
    optLowC: z.number(),
    optHighC: z.number(),
    growthMaxC: z.number(),
    heatStressC: z.number(),
  }),
  humidity: z.object({
    severeBelowRh: z.number(),
    stressBelowRh: z.number(),
    optLowRh: z.number(),
    optHighRh: z.number(),
  }),
  water: z.object({
    droughtStartTheta: z.number().describe('Fraction of plant-available water (0.05-0.5) below which drought stress starts; low for succulents'),
    rewaterTheta: z.number().describe('Fraction of available water at which to water again (0.05-0.65)'),
    airNeed: z.number().describe('Air-filled porosity roots need, 0.1 (bog tolerant) to 0.32 (rot-prone succulent)'),
    droughtHardiness: z.number().describe('0 wilts at once to 1 stores water for weeks'),
  }),
  growth: z.object({
    leafIntervalDays: z.number().describe('Days between new leaves in ideal indoor conditions'),
    leafExpansionDays: z.number(),
    juvenileLeafCm: z.number().describe('Blade length of a young plant leaf'),
    matureLeafCm: z.number().describe('Blade length of a mature indoor leaf'),
    maxLeaves: z.number().describe('Typical leaf count of a full indoor plant, 6 to 40'),
    transpirationMlPerM2: z.number().describe('Water transpired per m2 leaf per day at moderate indoor conditions: ~100 succulents, ~350 typical foliage, ~450 thin-leaved thirsty plants'),
  }),
})

const IntakeSchema = z.object({
  isPlant: z.boolean().describe('False if the input does not show or name a plant'),
  commonName: z.string(),
  scientificName: z.string().describe('Accepted binomial; genus only if the species cannot be told apart'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence in the identification'),
  reasoning: z.string().describe('One or two sentences: which visible or stated features support this identification, and what makes it uncertain'),
  alternatives: z.array(z.object({ commonName: z.string(), scientificName: z.string() })).describe('Up to two other plausible identifications'),
  libraryId: z.string().nullable().describe('Id from the curated library if this plant is that species or a cultivar of it, else null'),
  symptoms: z.array(z.enum(SYMPTOM_KEYS as [SymptomKey, ...SymptomKey[]])).describe('Only symptoms clearly visible in the photo or stated in the text'),
  observations: z.string().describe('What is visible about the plant and its setting that bears on its care: pot, soil surface, light, damage. Empty if nothing notable.'),
  profile: ProfileSchema.nullable().describe('Estimated parameters. Null when libraryId is set or isPlant is false.'),
})

export type Intake = z.infer<typeof IntakeSchema>

export interface IntakeResult {
  intake: Intake
  /** Curated profile when matched, otherwise a sanitised AI estimate. */
  species: SpeciesProfile | null
}

export class IntakeError extends Error {}

function systemPrompt(): string {
  const library = curatedSpecies()
    .map((s) => `- ${s.id}: ${s.commonName} (${s.scientificName})`)
    .join('\n')
  return `You identify houseplants for Plant Lab, a simulator that predicts how a plant will fare in a set of indoor conditions. The person will either describe or name a plant, or share a photo of their own plant.

Your output feeds a numerical model and is shown to the person for confirmation before anything is saved, so accuracy and honest uncertainty matter more than sounding sure.

Identification: houseplants are usually photographed without flowers and many cultivars look alike, so state your confidence plainly and list alternatives when the features fit more than one plant. Give genus only when the species cannot be told apart. If the input is not a plant, set isPlant to false.

Curated library: these species already have hand-written profiles. If the plant is one of them, or a cultivar of one, return its id as libraryId and leave profile null, because the curated numbers are more trustworthy than a fresh estimate.
${library}

Otherwise set libraryId to null and estimate a profile from what you know of the species' native habitat and established indoor care guidance. Use round numbers. These are approximate working ranges, so prefer a sensible value for the plant's care group over false precision.

Symptoms and observations: report only what is actually visible in the photo or stated in the text. A photo shows symptoms, not causes, so do not diagnose; the simulator combines your observations with the person's conditions to do that.`
}

export interface IntakeInput {
  text?: string
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
}

export async function identifyPlant(apiKey: string, input: IntakeInput): Promise<IntakeResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } })
  content.push({
    type: 'text',
    text: input.text?.trim()
      ? `${input.image ? 'This is my plant. ' : ''}${input.text.trim()}`
      : 'This is my plant. Identify it and note anything visible that bears on its health.',
  })

  let response
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // a declined request is re-run on a fallback model inside the same call
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: systemPrompt(),
      messages: [{ role: 'user', content }],
      output_config: { format: betaZodOutputFormat(IntakeSchema) },
    })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new IntakeError('The API key was rejected. Check it in settings.')
    if (error instanceof Anthropic.PermissionDeniedError) throw new IntakeError('This API key is not allowed to use the model.')
    if (error instanceof Anthropic.RateLimitError) throw new IntakeError('Rate limited by the API. Wait a moment and try again.')
    if (error instanceof Anthropic.BadRequestError) throw new IntakeError(`The request was rejected: ${error.message}`)
    if (error instanceof Anthropic.APIConnectionError) throw new IntakeError('Could not reach the Anthropic API. Check your connection.')
    if (error instanceof Anthropic.APIError) throw new IntakeError(`The API returned an error (${error.status ?? 'unknown'}).`)
    throw error
  }

  if (response.stop_reason === 'refusal') throw new IntakeError('The model declined to answer this request.')
  if (response.stop_reason === 'max_tokens') throw new IntakeError('The answer was cut off. Try again.')
  const intake = response.parsed_output
  if (!intake) throw new IntakeError('The model returned an answer that could not be read. Try again.')
  if (!intake.isPlant) return { intake, species: null }

  // prefer the curated profile; only accept an id that really exists
  const curated = intake.libraryId ? curatedSpecies().find((s) => s.id === intake.libraryId) : undefined
  if (curated) return { intake, species: getSpecies(curated.id) }
  if (!intake.profile) throw new IntakeError('The model identified the plant but returned no parameters. Try again.')

  const species = sanitizeProfile({
    ...intake.profile,
    commonName: intake.commonName,
    scientificName: intake.scientificName,
    source: 'ai',
    confidence: intake.confidence === 'high' ? 'medium' : 'low', // an estimate is never 'high'
    toxicToPets: null, // never taken from a model
  })
  return { intake, species }
}

/** Downscale a photo in the browser so uploads stay small. Returns base64 JPEG without the data-URL prefix. */
export async function fileToJpegBase64(file: File, maxSide = 1400): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
  return { base64: dataUrl.split(',')[1], dataUrl }
}
