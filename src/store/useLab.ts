import { create } from 'zustand'
import { applyPatch, defaultConfig, newExperiment, newGrowLight, normalizeConfig } from '../sim/defaults'
import { getSpecies, registerSpecies, sanitizeProfile, unregisterSpecies } from '../sim/species'
import { initialSnapshot, runSimulation } from '../sim/engine'
import { recommend } from '../sim/recommend'
import type {
  DaySnapshot,
  DeepPartial,
  Experiment,
  ExperimentConfig,
  LeafState,
  Observation,
  Recommendation,
  SimulationResult,
  SpeciesProfile,
} from '../sim/types'

const CURRENT_KEY = 'plantlab.current.v1'
const SAVED_KEY = 'plantlab.experiments.v1'
const VIEW_KEY = 'plantlab.view.v2'
const SPECIES_KEY = 'plantlab.species.v1'
const API_KEY = 'plantlab.apikey.v1'

// user-added (AI-estimated) species must be registered before any saved experiment is revived
const storedSpecies: SpeciesProfile[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(SPECIES_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.map((r) => sanitizeProfile(r)) : []
  } catch {
    return []
  }
})()
storedSpecies.forEach(registerSpecies)

export interface ViewSettings {
  grid: boolean
  atmosphere: boolean
  shadows: boolean
  props: boolean
  autoRotate: boolean
  liveSim: boolean
  /** true = the full workstation (default); false = the guided layout with plain-language controls */
  advanced: boolean
}

const defaultView: ViewSettings = {
  grid: true,
  atmosphere: true,
  shadows: true,
  props: true,
  autoRotate: false,
  liveSim: false,
  advanced: true,
}

export type CameraPreset = 'iso' | 'front' | 'side' | 'top'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable or full: the app keeps working in memory */
  }
}

function reviveExperiment(e: Partial<Experiment> | null): Experiment | null {
  if (!e || typeof e !== 'object' || !e.id) return null
  const base = newExperiment(e.name ?? 'Untitled experiment')
  return {
    ...base,
    ...e,
    name: e.name ?? base.name,
    durationDays: e.durationDays ?? base.durationDays,
    config: normalizeConfig(e.config),
  } as Experiment
}

function loadSaved(): Experiment[] {
  const list = readJson<Partial<Experiment>[]>(SAVED_KEY)
  if (!Array.isArray(list)) return []
  return list.map(reviveExperiment).filter((e): e is Experiment => e !== null)
}

interface LabState {
  /** 'garden' is the home list of plants; 'lab' is the workstation for one of them */
  screen: 'garden' | 'lab'
  customSpecies: SpeciesProfile[]
  apiKey: string
  experiment: Experiment
  dirty: boolean
  past: ExperimentConfig[]
  future: ExperimentConfig[]
  selection: string | null
  hidden: Record<string, boolean>
  expanded: Record<string, boolean>
  result: SimulationResult | null
  recommendations: Recommendation[]
  /** Config changed since the result was computed. */
  stale: boolean
  day: number
  playing: boolean
  speed: number
  rightTab: 'properties' | 'results' | 'checkup'
  view: ViewSettings
  cameraRequest: { preset: CameraPreset; n: number }
  saved: Experiment[]
  compareOpen: boolean
  /** True while a viewport gizmo is being dragged (suspends orbit controls). */
  dragging: boolean

  update: (fn: (draft: ExperimentConfig) => void, key?: string) => void
  patch: (p: DeepPartial<ExperimentConfig>, key?: string) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  toggleHidden: (id: string) => void
  toggleExpanded: (id: string) => void
  rename: (id: string, name: string) => void
  run: () => void
  setDay: (day: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setDuration: (days: number) => void
  setRightTab: (tab: 'properties' | 'results' | 'checkup') => void
  setScreen: (screen: 'garden' | 'lab') => void
  setApiKey: (key: string) => void
  addSpecies: (profile: SpeciesProfile) => void
  removeSpecies: (id: string) => void
  /** Create a plant, save it to the garden and open it. */
  addPlant: (speciesId: string, opts?: { name?: string; patch?: DeepPartial<ExperimentConfig>; observation?: Observation }) => void
  setSpecies: (speciesId: string) => void
  setObservation: (observation: Observation | undefined) => void
  setView: (v: Partial<ViewSettings>) => void
  requestCamera: (preset: CameraPreset) => void
  setCompareOpen: (open: boolean) => void
  setDragging: (dragging: boolean) => void
  newExperiment: () => void
  renameExperiment: (name: string) => void
  save: () => void
  load: (id: string) => void
  deleteSaved: (id: string) => void
  duplicate: () => void
  applyRecommendation: (rec: Recommendation) => void
  addGrowLight: () => void
  duplicateGrowLight: (id: string) => void
  removeGrowLight: (id: string) => void
}

const HISTORY_LIMIT = 100
let lastKey: string | undefined
let lastTime = 0

function compute(config: ExperimentConfig, days: number) {
  const result = runSimulation(config, days)
  return { result, recommendations: recommend(config, result) }
}

const storedCurrent = reviveExperiment(readJson<Partial<Experiment>>(CURRENT_KEY))
const initialExperiment = storedCurrent ?? newExperiment('Golden pothos', 'epipremnum-aureum')
const initialSaved = loadSaved()
// first run: the garden starts with the default plant so it is never empty
if (!storedCurrent && initialSaved.length === 0) {
  initialSaved.push(initialExperiment)
  // the starting greenhouse holds only species whose key values are sourced
  for (const id of ['dracaena-trifasciata', 'spathiphyllum', 'aglaonema', 'goeppertia-orbifolia', 'zamioculcas-zamiifolia', 'philodendron-hederaceum', 'dracaena-fragrans', 'dieffenbachia']) {
    const e = newExperiment(getSpecies(id).commonName, id)
    e.id = `seed-${id}`
    initialSaved.push(e)
  }
  writeJson(SAVED_KEY, initialSaved)
}

export const useLab = create<LabState>((set, get) => ({
  screen: 'garden',
  customSpecies: storedSpecies,
  apiKey: (() => {
    try {
      return localStorage.getItem(API_KEY) ?? ''
    } catch {
      return ''
    }
  })(),
  experiment: initialExperiment,
  dirty: !initialSaved.some((e) => e.id === initialExperiment.id && e.updatedAt === initialExperiment.updatedAt),
  past: [],
  future: [],
  selection: null,
  hidden: {},
  expanded: { environment: true, plant: true, lights: true },
  result: null,
  recommendations: [],
  stale: false,
  day: 0,
  playing: false,
  speed: 1,
  rightTab: 'properties',
  view: { ...defaultView, ...(readJson<Partial<ViewSettings>>(VIEW_KEY) ?? {}) },
  cameraRequest: { preset: 'iso', n: 0 },
  saved: initialSaved,
  compareOpen: false,
  dragging: false,

  update: (fn, key) => {
    const { experiment, past, view } = get()
    const before = experiment.config
    const draft = structuredClone(before)
    fn(draft)
    if (JSON.stringify(draft) === JSON.stringify(before)) return
    const now = Date.now()
    // rapid edits to the same control collapse into one undo step
    const coalesce = key !== undefined && key === lastKey && now - lastTime < 900 && past.length > 0
    lastKey = key
    lastTime = now
    set({
      experiment: { ...experiment, config: draft, updatedAt: now },
      past: coalesce ? past : [...past.slice(-HISTORY_LIMIT + 1), before],
      future: [],
      dirty: true,
      stale: get().result !== null,
    })
    if (view.liveSim && get().result) get().run()
  },

  patch: (p, key) => get().update((d) => Object.assign(d, applyPatch(d, p)), key),

  undo: () => {
    const { past, future, experiment } = get()
    if (!past.length) return
    lastKey = undefined
    set({
      experiment: { ...experiment, config: past[past.length - 1], updatedAt: Date.now() },
      past: past.slice(0, -1),
      future: [experiment.config, ...future],
      dirty: true,
      stale: get().result !== null,
    })
    if (get().view.liveSim && get().result) get().run()
  },

  redo: () => {
    const { past, future, experiment } = get()
    if (!future.length) return
    lastKey = undefined
    set({
      experiment: { ...experiment, config: future[0], updatedAt: Date.now() },
      past: [...past, experiment.config],
      future: future.slice(1),
      dirty: true,
      stale: get().result !== null,
    })
    if (get().view.liveSim && get().result) get().run()
  },

  select: (id) => {
    if (get().selection === id) return
    set({ selection: id, rightTab: 'properties' })
  },
  toggleHidden: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })),
  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !(s.expanded[id] ?? false) } })),
  rename: (id, name) =>
    get().update((d) => {
      const light = d.light.growLights.find((g) => `light:${g.id}` === id)
      if (light) light.name = name.trim() || light.name
      else if (name.trim()) d.names[id] = name.trim()
      else delete d.names[id]
    }),

  run: () => {
    const { experiment, day } = get()
    const { result, recommendations } = compute(experiment.config, experiment.durationDays)
    set({ result, recommendations, stale: false, day: Math.min(day, result.durationDays) })
  },

  setDay: (day) => {
    const max = get().result?.durationDays ?? 0
    set({ day: Math.max(0, Math.min(max, day)) })
  },
  setPlaying: (playing) => {
    const s = get()
    if (playing) {
      if (!s.result || s.stale) s.run()
      const max = get().result!.durationDays
      set({ playing: true, day: get().day >= max ? 0 : get().day })
    } else set({ playing: false })
  },
  setSpeed: (speed) => set({ speed }),
  setDuration: (days) => {
    const { experiment, result } = get()
    if (experiment.durationDays === days) return
    set({ experiment: { ...experiment, durationDays: days, updatedAt: Date.now() }, dirty: true })
    if (result) get().run()
  },
  setRightTab: (rightTab) => set({ rightTab }),
  setScreen: (screen) => {
    // going home keeps the garden in step with what was changed in the lab
    if (screen === 'garden' && get().dirty) get().save()
    set({ screen, playing: false })
  },
  setApiKey: (key) => {
    try {
      if (key) localStorage.setItem(API_KEY, key)
      else localStorage.removeItem(API_KEY)
    } catch {
      /* kept in memory only */
    }
    set({ apiKey: key })
  },
  addSpecies: (profile) => {
    registerSpecies(profile)
    const customSpecies = [...get().customSpecies.filter((s) => s.id !== profile.id), profile]
    writeJson(SPECIES_KEY, customSpecies)
    set({ customSpecies })
  },
  removeSpecies: (id) => {
    unregisterSpecies(id)
    const customSpecies = get().customSpecies.filter((s) => s.id !== id)
    writeJson(SPECIES_KEY, customSpecies)
    set({ customSpecies })
  },
  addPlant: (speciesId, opts) => {
    lastKey = undefined
    const sp = getSpecies(speciesId)
    const taken = get().saved.filter((e) => e.config.speciesId === speciesId).length
    const exp = newExperiment(opts?.name ?? (taken ? `${sp.commonName} ${taken + 1}` : sp.commonName), speciesId)
    if (opts?.patch) exp.config = applyPatch(exp.config, opts.patch)
    if (opts?.observation) exp.observation = opts.observation
    const saved = [...get().saved, exp]
    writeJson(SAVED_KEY, saved)
    set({
      saved,
      experiment: structuredClone(exp),
      past: [],
      future: [],
      result: null,
      recommendations: [],
      stale: false,
      day: 0,
      playing: false,
      dirty: false,
      selection: null,
      screen: 'lab',
      rightTab: opts?.observation?.symptoms.length ? 'checkup' : 'properties',
    })
    get().run()
  },
  setSpecies: (speciesId) => {
    const { experiment } = get()
    if (experiment.config.speciesId === speciesId) return
    // a different plant needs its own pot, mix and watering, but the spot it stands in stays the same
    get().update((d) => {
      const fresh = defaultConfig(speciesId)
      d.speciesId = speciesId
      d.plant = fresh.plant
      d.pot = fresh.pot
      d.medium = fresh.medium
      d.watering = fresh.watering
    })
    if (get().result) get().run()
  },
  setObservation: (observation) => {
    const { experiment } = get()
    set({ experiment: { ...experiment, observation, updatedAt: Date.now() }, dirty: true })
  },
  setView: (v) => {
    const view = { ...get().view, ...v }
    writeJson(VIEW_KEY, view)
    set({ view })
  },
  requestCamera: (preset) => set((s) => ({ cameraRequest: { preset, n: s.cameraRequest.n + 1 } })),
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  setDragging: (dragging) => set({ dragging }),

  newExperiment: () => {
    lastKey = undefined
    const n = get().saved.length + 1
    set({
      experiment: newExperiment(`Experiment ${n}`),
      past: [],
      future: [],
      result: null,
      recommendations: [],
      stale: false,
      day: 0,
      playing: false,
      dirty: true,
      selection: null,
      rightTab: 'properties',
    })
  },
  renameExperiment: (name) => {
    const { experiment } = get()
    if (!name.trim() || name === experiment.name) return
    set({ experiment: { ...experiment, name: name.trim(), updatedAt: Date.now() }, dirty: true })
  },
  save: () => {
    const { experiment, saved } = get()
    const stamped = { ...experiment, updatedAt: Date.now() }
    const next = saved.some((e) => e.id === stamped.id)
      ? saved.map((e) => (e.id === stamped.id ? stamped : e))
      : [...saved, stamped]
    writeJson(SAVED_KEY, next)
    set({ saved: next, experiment: stamped, dirty: false })
  },
  load: (id) => {
    const found = get().saved.find((e) => e.id === id)
    if (!found) return
    lastKey = undefined
    set({
      experiment: structuredClone(found),
      past: [],
      future: [],
      result: null,
      recommendations: [],
      stale: false,
      day: 0,
      playing: false,
      dirty: false,
      selection: null,
      screen: 'lab',
      rightTab: 'properties',
    })
    get().run()
  },
  deleteSaved: (id) => {
    const next = get().saved.filter((e) => e.id !== id)
    writeJson(SAVED_KEY, next)
    set({ saved: next, dirty: get().experiment.id === id ? true : get().dirty })
  },
  duplicate: () => {
    const { experiment } = get()
    const copy = newExperiment(`${experiment.name} copy`)
    lastKey = undefined
    set({
      experiment: { ...copy, durationDays: experiment.durationDays, config: structuredClone(experiment.config) },
      past: [],
      future: [],
      dirty: true,
    })
  },

  applyRecommendation: (rec) => {
    get().patch(rec.patch)
    get().run()
  },

  addGrowLight: () => {
    let id = ''
    get().update((d) => {
      const light = newGrowLight(d.light.growLights.length)
      id = light.id
      d.light.growLights.push(light)
    })
    set((s) => ({ selection: `light:${id}`, rightTab: 'properties', expanded: { ...s.expanded, lights: true } }))
  },
  duplicateGrowLight: (id) => {
    let newId = ''
    get().update((d) => {
      const src = d.light.growLights.find((g) => g.id === id)
      if (!src) return
      const copy = { ...src, ...newGrowLight(d.light.growLights.length), name: `${src.name} copy` }
      copy.ppfd = src.ppfd
      copy.hoursPerDay = src.hoursPerDay
      copy.colorK = src.colorK
      copy.enabled = src.enabled
      newId = copy.id
      d.light.growLights.push(copy)
    })
    if (newId) set({ selection: `light:${newId}` })
  },
  removeGrowLight: (id) => {
    get().update((d) => {
      d.light.growLights = d.light.growLights.filter((g) => g.id !== id)
    })
    if (get().selection === `light:${id}`) set({ selection: 'lights' })
  },
}))

// keep the working experiment across reloads
let saveTimer: ReturnType<typeof setTimeout> | undefined
useLab.subscribe((s, prev) => {
  if (s.experiment === prev.experiment) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => writeJson(CURRENT_KEY, useLab.getState().experiment), 250)
})

/* ---------- derived selectors ---------- */

const PARENTS: Record<string, string> = {
  atmosphere: 'environment',
  temperature: 'environment',
  watering: 'environment',
  leaves: 'plant',
  stems: 'plant',
  roots: 'plant',
}

export function parentOf(id: string): string | undefined {
  if (id.startsWith('light:')) return 'lights'
  return PARENTS[id]
}

export function isHidden(hidden: Record<string, boolean>, id: string): boolean {
  let cur: string | undefined = id
  while (cur) {
    if (hidden[cur]) return true
    cur = parentOf(cur)
  }
  return false
}

export function useHidden(id: string): boolean {
  return useLab((s) => isHidden(s.hidden, id))
}

/** True when this object, or the group that contains it, is selected. */
export function useSelected(id: string): boolean {
  return useLab((s) => s.selection === id || (s.selection !== null && parentOf(id) === s.selection))
}

const num = (a: number, b: number, t: number) => a + (b - a) * t

function lerpLeaves(a: LeafState[], b: LeafState[], t: number): LeafState[] {
  const next = new Map(b.map((l) => [l.id, l]))
  const out: LeafState[] = []
  for (const l of a) {
    const n = next.get(l.id)
    // a leaf about to drop finishes dying over the day
    if (!n) out.push({ ...l, yellow: num(l.yellow, Math.max(l.yellow, 0.98), t), brown: num(l.brown, Math.max(l.brown, 0.6), t) })
    else out.push({ ...l, expansion: num(l.expansion, n.expansion, t), yellow: num(l.yellow, n.yellow, t), brown: num(l.brown, n.brown, t) })
  }
  for (const l of b) if (!a.some((x) => x.id === l.id)) out.push({ ...l, expansion: l.expansion * t })
  return out
}

function lerpSnapshot(a: DaySnapshot, b: DaySnapshot, t: number): DaySnapshot {
  if (t <= 0.001) return a
  return {
    ...a,
    health: num(a.health, b.health, t),
    turgor: num(a.turgor, b.turgor, t),
    etiolation: num(a.etiolation, b.etiolation, t),
    chlorosis: num(a.chlorosis, b.chlorosis, t),
    rootHealth: num(a.rootHealth, b.rootHealth, t),
    rootFill: num(a.rootFill, b.rootFill, t),
    moisture: num(a.moisture, b.moisture, t),
    reservoir: num(a.reservoir, b.reservoir, t),
    leaves: lerpLeaves(a.leaves, b.leaves, t),
  }
}

let memoConfig: ExperimentConfig | null = null
let memoInitial: DaySnapshot | null = null
function initialFor(config: ExperimentConfig): DaySnapshot {
  if (memoConfig !== config || !memoInitial) {
    memoConfig = config
    memoInitial = initialSnapshot(config)
  }
  return memoInitial
}

let memoKey: unknown[] = []
let memoSnap: DaySnapshot | null = null

/** The plant state to draw right now: day 0 follows the live config, later days follow the last run. */
export function selectSnapshot(s: LabState): DaySnapshot {
  if (!s.result || s.day <= 0) return initialFor(s.experiment.config)
  if (memoSnap && memoKey[0] === s.result && memoKey[1] === s.day) return memoSnap
  const snaps = s.result.snapshots
  const i = Math.min(snaps.length - 1, Math.floor(s.day))
  const j = Math.min(snaps.length - 1, i + 1)
  memoSnap = lerpSnapshot(snaps[i], snaps[j], s.day - i)
  memoKey = [s.result, s.day]
  return memoSnap
}

export function useSnapshot(): DaySnapshot {
  return useLab(selectSnapshot)
}
