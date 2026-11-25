import { useMemo, useRef, useState } from 'react'
import { Camera, KeyRound, Search, Sparkles, Trash2, X } from 'lucide-react'
import { IntakeError, fileToJpegBase64, identifyPlant, type IntakeResult } from '../ai/identify'
import { SYMPTOMS, rankForSpot, spotPatch, type Spot } from '../sim/diagnose'
import { FACTOR_LABELS } from '../sim/engine'
import { LIGHT_PRESETS } from '../sim/light'
import { searchSpecies } from '../sim/species'
import type { SpeciesProfile } from '../sim/types'
import { useLab } from '../store/useLab'
import { GardenScene } from '../scene/GardenScene'
import { NumberInput, ScoreBar } from './controls/controls'

/** Small silhouette per growth habit, tinted with the species' leaf colour. */
export function HabitGlyph({ sp, size = 44 }: { sp: SpeciesProfile; size?: number }) {
  const c = sp.leaf.color
  const leaf = (x: number, y: number, r: number, rot: number, w = 0.5) => (
    <ellipse key={`${x}-${y}-${rot}`} cx={x} cy={y} rx={r * Math.max(0.16, Math.min(0.62, sp.leaf.aspect * w + 0.12))} ry={r} transform={`rotate(${rot} ${x} ${y})`} fill={c} />
  )
  const shapes =
    sp.habit === 'rosette'
      ? [-58, -32, -10, 10, 32, 58].map((a) => leaf(24 + a * 0.16, 20 - Math.abs(a) * 0.03, 13, a))
      : sp.habit === 'trailing'
        ? [leaf(15, 15, 6, -40), leaf(33, 15, 6, 40), leaf(9, 25, 5.5, -15), leaf(39, 25, 5.5, 15), leaf(8, 36, 5, 0), leaf(40, 36, 5, 0), leaf(24, 12, 6, 0)]
        : sp.habit === 'cane'
          ? [leaf(15, 9, 7, -55), leaf(33, 12, 7, 55), leaf(14, 20, 7, -65), leaf(34, 23, 7, 65), leaf(24, 5, 6, 0)]
          : [leaf(12, 13, 9, -50, 0.7), leaf(36, 12, 9, 50, 0.7), leaf(24, 8, 9, 0, 0.7), leaf(15, 25, 7, -75, 0.7), leaf(34, 26, 7, 75, 0.7)]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      {sp.habit === 'cane' && <rect x="23" y="6" width="2" height="30" fill="#6b5a44" />}
      {shapes}
      <path d="M16 34h16l-2.2 11H18.2z" fill="#b9673e" />
    </svg>
  )
}

function Badge({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'warn' | 'good' }) {
  const cls = tone === 'warn' ? 'border-[#e2d3ab] bg-[#f3ead6] text-[#5e4712]' : tone === 'good' ? 'border-forest-soft bg-forest-soft text-forest-deep' : 'border-line text-ink-2'
  return <span className={`rounded-[3px] border px-1.5 py-px text-[10.5px] leading-tight ${cls}`}>{children}</span>
}

export function SpeciesBadges({ sp }: { sp: SpeciesProfile }) {
  return (
    <>
      {sp.source === 'ai' && <Badge tone="warn">AI-estimated profile</Badge>}
      {sp.source === 'curated' && sp.confidence === 'high' && <Badge tone="good">well sourced</Badge>}
      {sp.source === 'curated' && sp.confidence === 'medium' && <Badge>partly sourced</Badge>}
      {sp.source === 'curated' && sp.confidence === 'low' && <Badge tone="warn">little published data</Badge>}
      {sp.toxicToPets === true && <Badge>toxic to pets</Badge>}
      {sp.toxicToPets === false && <Badge tone="good">pet-safe</Badge>}
      {sp.toxicToPets === null && <Badge>pet safety unknown</Badge>}
    </>
  )
}

/* ---------- add a plant ---------- */

function ApiKeyField() {
  const apiKey = useLab((s) => s.apiKey)
  const setApiKey = useLab((s) => s.setApiKey)
  const [editing, setEditing] = useState(!apiKey)
  const [draft, setDraft] = useState('')
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink">
        <KeyRound size={11} /> API key saved in this browser · change
      </button>
    )
  return (
    <div className="rounded-[4px] border border-line bg-sunken p-2">
      <label className="mb-1 block text-[11.5px] text-ink-2" htmlFor="api-key">
        Anthropic API key. Stored only in this browser and sent only to the Anthropic API.
      </label>
      <div className="flex gap-1.5">
        <input id="api-key" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-…" autoComplete="off" className="num h-[26px] min-w-0 flex-1 rounded-[3px] border border-line bg-surface px-2 text-[12px]" style={{ userSelect: 'text' }} />
        <button
          type="button"
          disabled={!draft.trim() && !apiKey}
          onClick={() => {
            setApiKey(draft.trim())
            setDraft('')
            setEditing(false)
          }}
          className="rounded-[3px] bg-ink px-2.5 text-surface disabled:opacity-40"
        >
          {draft.trim() ? 'Save' : 'Remove key'}
        </button>
      </div>
    </div>
  )
}

function AiIntake({ onDone }: { onDone: () => void }) {
  const apiKey = useLab((s) => s.apiKey)
  const addSpecies = useLab((s) => s.addSpecies)
  const addPlant = useLab((s) => s.addPlant)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ base64: string; dataUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<IntakeResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const offline = text.trim() ? searchSpecies(text).slice(0, 3) : []

  const identify = async () => {
    setBusy(true)
    setError(null)
    setFound(null)
    try {
      setFound(await identifyPlant(apiKey, { text, image: photo ? { base64: photo.base64, mediaType: 'image/jpeg' } : undefined }))
    } catch (e) {
      setError(e instanceof IntakeError ? e.message : 'Something went wrong while contacting the model.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (!found?.species) return
    if (found.species.source === 'ai') addSpecies(found.species)
    const symptoms = found.intake.symptoms
    addPlant(found.species.id, {
      name: found.intake.commonName || found.species.commonName,
      observation: symptoms.length || found.intake.observations ? { symptoms, note: found.intake.observations, source: photo ? 'photo' : 'manual', at: Date.now() } : undefined,
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="grid h-[112px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[5px] border border-dashed border-line-strong bg-sunken text-ink-3 hover:border-forest hover:text-forest"
        >
          {photo ? <img src={photo.dataUrl} alt="Your plant" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-[11.5px]"><Camera size={20} /> Add a photo</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) {
              setFound(null)
              setPhoto(await fileToJpegBase64(file))
            }
            e.target.value = ''
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Name or describe the plant, and anything you have noticed.\n\ne.g. "String of hearts, leaves going soft and yellow near the soil"'}
          className="h-[112px] min-w-0 flex-1 resize-none rounded-[5px] border border-line bg-surface p-2 text-[12.5px] leading-snug"
          style={{ userSelect: 'text' }}
        />
      </div>
      <ApiKeyField />
      {!apiKey && offline.length > 0 && (
        <p className="text-[11.5px] text-ink-2">
          Without a key, matches from the library:{' '}
          {offline.map((s) => (
            <button key={s.id} type="button" className="mr-2 underline hover:text-forest" onClick={() => { addPlant(s.id); onDone() }}>
              {s.commonName}
            </button>
          ))}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !apiKey || (!text.trim() && !photo)} onClick={identify} className="flex items-center gap-1.5 rounded-[4px] bg-forest px-3 py-1.5 font-medium text-surface hover:bg-forest-deep disabled:opacity-40">
          <Sparkles size={13} /> {busy ? 'Identifying…' : 'Identify'}
        </button>
        <span className="text-[11px] leading-snug text-ink-3">The photo and text are sent to the Anthropic API. You confirm the result before anything is added.</span>
      </div>
      {error && <p role="alert" className="rounded-[4px] border-l-2 border-rust bg-[#f3dedb] px-2 py-1.5 text-[12px] text-[#6b241b]">{error}</p>}

      {found && !found.intake.isPlant && <p className="rounded-[4px] border border-line bg-sunken p-2.5 text-[12px]">That does not look like a plant. {found.intake.reasoning}</p>}
      {found?.species && (
        <div className="rise rounded-[5px] border border-line-strong bg-surface p-3">
          <div className="flex items-start gap-3">
            <HabitGlyph sp={found.species} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[21px] leading-tight">{found.intake.commonName}</div>
              <div className="text-[12px] italic text-ink-3">{found.intake.scientificName}</div>
            </div>
            <Badge tone={found.intake.confidence === 'high' ? 'good' : 'warn'}>{found.intake.confidence} confidence</Badge>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-ink-2">{found.intake.reasoning}</p>
          {found.intake.alternatives.length > 0 && (
            <p className="mt-1 text-[11.5px] text-ink-3">Could also be: {found.intake.alternatives.map((a) => `${a.commonName} (${a.scientificName})`).join(', ')}.</p>
          )}
          <p className={`mt-2 rounded-[3px] border-l-2 px-2 py-1.5 text-[11.5px] leading-snug ${found.species.source === 'ai' ? 'border-amber bg-[#f3ead6] text-[#5e4712]' : 'border-forest bg-forest-soft text-forest-deep'}`}>
            {found.species.source === 'ai'
              ? 'Not in the curated library. Its light, water and temperature ranges were estimated by the model and have not been checked against a horticultural source, so treat its scores as a rough guide.'
              : `Matched to the curated ${found.species.commonName} profile.`}
          </p>
          {(found.intake.symptoms.length > 0 || found.intake.observations) && (
            <div className="mt-2">
              <div className="label-caps mb-1">Seen in the {photo ? 'photo' : 'description'}</div>
              <div className="flex flex-wrap gap-1">
                {found.intake.symptoms.map((s) => (
                  <Badge key={s} tone="warn">{SYMPTOMS[s].label}</Badge>
                ))}
              </div>
              {found.intake.observations && <p className="mt-1 text-[11.5px] leading-snug text-ink-2">{found.intake.observations}</p>}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={confirm} className="rounded-[4px] bg-forest px-3 py-1.5 font-medium text-surface hover:bg-forest-deep">
              Yes, add this plant
            </button>
            <button type="button" onClick={() => setFound(null)} className="rounded-[4px] px-2 py-1.5 text-ink-2 hover:bg-sunken">
              Not right
            </button>
            {found.intake.symptoms.length > 0 && <span className="text-[11px] text-ink-3">Opens the check-up with these symptoms.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function AddPlantDialog({ onClose }: { onClose: () => void }) {
  const addPlant = useLab((s) => s.addPlant)
  const removeSpecies = useLab((s) => s.removeSpecies)
  const [tab, setTab] = useState<'library' | 'ai' | 'spot'>('library')
  const [query, setQuery] = useState('')
  const custom = useLab((s) => s.customSpecies)
  const results = useMemo(() => searchSpecies(query), [query, custom])
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(34,39,31,0.35)] p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Add a plant" className={`rise flex max-h-full w-full flex-col ${tab === 'spot' ? 'max-w-[900px]' : 'max-w-[640px]'}  rounded-[6px] border border-line-strong bg-panel shadow-[0_18px_60px_rgba(34,39,31,0.25)]`}>
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
          <h2 className="font-semibold text-[21px] leading-none">Add a plant</h2>
          <div className="flex-1" />
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-6 w-6 place-items-center rounded-[4px] text-ink-2 hover:bg-sunken">
            <X size={15} />
          </button>
        </div>
        <div role="tablist" className="flex shrink-0 gap-1 border-b border-line px-4 pt-2">
          {(
            [
              ['library', 'Choose from library'],
              ['ai', 'Photo or description'],
              ['spot', 'What grows where?'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-t-[4px] border border-b-0 px-3 py-1.5 ${tab === id ? 'border-line bg-surface font-medium' : 'border-transparent text-ink-2 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="scroll min-h-0 flex-1 p-4">
          {tab === 'library' ? (
            <>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2 top-[7px] text-ink-3" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search species" className="h-[28px] w-full rounded-[4px] border border-line bg-surface pl-7 pr-2" style={{ userSelect: 'text' }} />
              </div>
              <ul className="flex flex-col gap-1">
                {results.map((sp) => (
                  <li key={sp.id} className="group flex items-center gap-3 rounded-[5px] border border-line bg-surface px-2.5 py-2 hover:border-forest">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { addPlant(sp.id); onClose() }}>
                      <HabitGlyph sp={sp} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{sp.commonName} <span className="font-normal italic text-ink-3">{sp.scientificName}</span></span>
                        <span className="block truncate text-[11.5px] text-ink-2">{sp.archetype}</span>
                        <span className="mt-1 flex flex-wrap gap-1"><SpeciesBadges sp={sp} /></span>
                      </span>
                    </button>
                    {sp.source === 'ai' && (
                      <button type="button" aria-label={`Delete ${sp.commonName} profile`} title="Delete this AI-estimated profile" onClick={() => removeSpecies(sp.id)} className="grid h-6 w-6 place-items-center rounded-[4px] text-ink-3 hover:text-rust">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                ))}
                {results.length === 0 && <li className="py-6 text-center text-ink-3">Nothing in the library matches. Try the photo or description tab.</li>}
              </ul>
            </>
          ) : tab === 'ai' ? (
            <AiIntake onDone={onClose} />
          ) : (
            <SpotFinder onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- what grows here ---------- */

function SpotFinder({ onDone }: { onDone: () => void }) {
  const addPlant = useLab((s) => s.addPlant)
  const custom = useLab((s) => s.customSpecies)
  const [spot, setSpot] = useState<Spot>({ lightPresetId: 'mid', rh: 40, meanC: 21, minC: 17, petSafeOnly: false })
  const matches = useMemo(() => rankForSpot(spot), [spot, custom])
  return (
    <section className="-m-4">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[12px] text-ink-2">Describe a place in your home. Every plant in the library is simulated there for six months with watering fitted to it.</p>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Light</span>
          <select className="select w-[230px]" value={spot.lightPresetId} onChange={(e) => setSpot({ ...spot, lightPresetId: e.target.value })}>
            {LIGHT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.note})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Humidity %</span>
          <NumberInput ariaLabel="Spot humidity" value={spot.rh} min={10} max={95} onChange={(rh) => setSpot({ ...spot, rh })} width={64} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Typical °C</span>
          <NumberInput ariaLabel="Spot temperature" value={spot.meanC} min={5} max={38} onChange={(meanC) => setSpot({ ...spot, meanC })} width={64} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Coldest night °C</span>
          <NumberInput ariaLabel="Spot coldest night" value={spot.minC} min={0} max={30} onChange={(minC) => setSpot({ ...spot, minC })} width={64} />
        </label>
        <label className="flex h-[22px] cursor-pointer items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={spot.petSafeOnly} onChange={(e) => setSpot({ ...spot, petSafeOnly: e.target.checked })} className="accent-[var(--color-forest)]" />
          Pet-safe only
        </label>
      </div>
      <ol>
        {matches.map((m, i) => (
          <li key={m.species.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
            <span className="num w-4 text-right text-[11px] text-ink-3">{i + 1}</span>
            <HabitGlyph sp={m.species} size={30} />
            <span className="w-[190px] min-w-0 shrink-0">
              <span className="block truncate font-medium">{m.species.commonName}</span>
              <span className="block truncate text-[11px] text-ink-3">{m.result.verdict}</span>
            </span>
            <span className="num w-7 text-right">{m.result.overall}</span>
            <span className="w-[120px] shrink-0">
              <ScoreBar value={m.result.overall} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-2">
              {m.result.scores[m.result.limitingFactor] < 85 ? `Held back by ${FACTOR_LABELS[m.result.limitingFactor].toLowerCase()} (${m.result.scores[m.result.limitingFactor]})` : `+${m.result.growth.leavesGrown} leaves in 6 months`}
              {m.species.source === 'ai' && <span className="text-amber"> · AI-estimated</span>}
            </span>
            <button
              type="button"
              onClick={() => { addPlant(m.species.id, { patch: { ...spotPatch(spot), watering: m.config.watering } }); onDone() }}
              className="shrink-0 rounded-[4px] border border-line bg-surface px-2 py-0.5 hover:border-forest hover:text-forest"
            >
              Add here
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-4 py-4 text-ink-3">No plants match that filter.</li>}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-ink-3">
        Estimates from a rule-based model with approximate species ranges, not a guarantee. Light is the input that matters most and the hardest to judge by eye; a phone light-meter reading is better than a guess.
      </p>
    </section>
  )
}

/** Home: the greenhouse, with nothing laid over it. Click a plant to open its lab; click an open place on the bench to add one. */
export function Garden() {
  const saved = useLab((s) => s.saved)
  const load = useLab((s) => s.load)
  const [adding, setAdding] = useState(false)
  return (
    <div className="relative col-span-3 row-span-2 min-h-0 overflow-hidden">
      <GardenScene plants={saved} onOpen={load} onAdd={() => setAdding(true)} />
      {adding && <AddPlantDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
