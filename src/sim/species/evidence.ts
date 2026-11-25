import type { DeepPartial, Evidence, SpeciesProfile } from '../types'

/**
 * Published values behind each curated profile, and the parameter overrides
 * derived from them.
 *
 * Every entry was read from the cited page (University of Florida IFAS
 * foliage guides and research notes, University of Georgia Bulletin 1318, NC
 * State Extension Plant Toolbox, ASPCA). Values are quoted in the source's own
 * units; the overrides convert them: foot-candles × 0.20 = µmol·m⁻²·s⁻¹ of
 * daylight, held for a 12 h day to give a daily light integral.
 *
 * What is NOT here has no published value for the species and stays a model
 * assumption: light level for near-full growth indoors, water use per leaf
 * area, days between leaves, and root-zone air thresholds.
 */
const UF = (ep: string) => `https://ask.ifas.ufl.edu/publication/${ep}`
const NOTE = (slug: string) => `https://web.archive.org/web/2020/https://mrec.ifas.ufl.edu/foliage/folnotes/${slug}.htm`
const RH917 = 'https://web.archive.org/web/2020/https://mrec.ifas.ufl.edu/foliage/resrpts/rh_91_7.htm'
const RH901 = 'https://web.archive.org/web/2020/https://mrec.ifas.ufl.edu/foliage/resrpts/rh_90_1.htm'
const UGA = 'https://fieldreport.caes.uga.edu/publications/B1318/'
const NC = (slug: string) => `https://plants.ces.ncsu.edu/plants/${slug}/`
const ASPCA = (slug: string) => `https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/${slug}`

const interiorMin = (value: string): Evidence => ({ field: 'Minimum interior light', value, source: 'Conover, Poole & Henley, UF research report RH-91-7', url: RH917 })
const production = (value: string): Evidence => ({ field: 'Production light', value, source: 'Conover & Poole, UF research report RH-90-1', url: RH901 })
const pets = (value: string, slug: string): Evidence => ({ field: 'Pets', value, source: 'ASPCA Animal Poison Control', url: ASPCA(slug) })

export interface Sourced {
  /** high: interior light, temperature and chilling all sourced for this species. medium: some at genus or class level. low: little published. */
  confidence: 'high' | 'medium' | 'low'
  overrides: DeepPartial<SpeciesProfile>
  evidence: Evidence[]
}

export const SOURCED: Record<string, Sourced> = {
  'epipremnum-aureum': {
    confidence: 'high',
    overrides: {
      toxicToPets: true,
      light: { dliMin: 0.4, dliLow: 0.65 },
      temperature: { lethalMinC: 0.5, damageMinC: 5, optLowC: 21, optHighC: 32, heatStressC: 35, growthMaxC: 38 },
      growth: { juvenileLeafCm: 7, matureLeafCm: 15 },
    },
    evidence: [
      interiorMin('75 ft-c'),
      { field: 'Low-light tolerance', value: 'as low as 50 fc, but new leaves small; 150 fc or more maintains colour and leaf size', source: 'UF/IFAS ENH894', url: UF('EP151') },
      { field: 'Production light', value: '2,500–3,250 ft-c (63–80 % shade)', source: 'UF/IFAS ENH894', url: UF('EP151') },
      { field: 'Temperature', value: '70–90 °F; quality declines above 95 °F days or below 65 °F nights', source: 'UF/IFAS ENH894', url: UF('EP151') },
      { field: 'Chilling injury', value: '33–40 °F for several hours', source: 'UF/IFAS ENH894', url: UF('EP151') },
      { field: 'Watering', value: 'does better grown "a little on the dry side" indoors', source: 'UF/IFAS ENH894', url: UF('EP151') },
      { field: 'Leaf size', value: '3–6 in long indoors', source: 'NC State Extension Plant Toolbox', url: NC('epipremnum-aureum') },
      pets('toxic to dogs and cats', 'golden-pothos'),
    ],
  },
  'philodendron-hederaceum': {
    confidence: 'high',
    overrides: {
      toxicToPets: true,
      leaf: { aspect: 0.6 },
      light: { dliMin: 0.4, dliLow: 0.65 },
      temperature: { lethalMinC: 0.5, damageMinC: 5, optLowC: 21, optHighC: 32, heatStressC: 38, growthMaxC: 41 },
      growth: { juvenileLeafCm: 7, matureLeafCm: 15 },
    },
    evidence: [
      interiorMin('75 ft-c (as P. scandens oxycardium)'),
      { field: 'Low-light tolerance', value: 'tolerates 75 fc; 150 fc or more maintains colour and leaf size', source: 'UF/IFAS ENH893', url: UF('EP150') },
      { field: 'Production light', value: '1,500–2,500 fc (80–88 % shade)', source: 'UF/IFAS ENH893', url: UF('EP150') },
      { field: 'Temperature', value: '70–90 °F; decline above 95 °F days or below 65 °F nights', source: 'UF/IFAS ENH893', url: UF('EP150') },
      { field: 'Heat', value: 'air to 105 °F not damaging with adequate soil moisture', source: 'UF foliage research note', url: NOTE('philo-hl') },
      { field: 'Chilling injury', value: '33–40 °F for several hours', source: 'UF/IFAS ENH893', url: UF('EP150') },
      { field: 'Leaf size', value: '3–6 in long, 1–3 in wide', source: 'NC State Extension Plant Toolbox', url: NC('philodendron-hederaceum') },
      pets('toxic to dogs, cats and horses', 'heartleaf-philodendron'),
    ],
  },
  'dracaena-trifasciata': {
    confidence: 'high',
    overrides: {
      toxicToPets: true,
      leaf: { aspect: 0.08 },
      light: { dliLow: 0.65 },
      temperature: { damageMinC: 7, optLowC: 21, optHighC: 32 },
      growth: { matureLeafCm: 80 },
    },
    evidence: [
      interiorMin('75 ft-c (Sansevieria species and cultivars)'),
      production('1,500–6,000 ft-c'),
      { field: 'Low-light response', value: 'at a few hundred foot-candles leaves grow slowly, elongated, weak and darker', source: 'UF foliage research note', url: NOTE('sansevie') },
      { field: 'Temperature', value: 'good growth 70–90 °F; keep at 45 °F or above', source: 'UF foliage research note', url: NOTE('sansevie') },
      { field: 'Humidity', value: 'tolerates low (5–24 %)', source: 'University of Georgia Bulletin 1318', url: UGA },
      { field: 'Watering', value: 'allow soil to dry between waterings; in winter every one to two months', source: 'NC State Extension Plant Toolbox', url: NC('dracaena-trifasciata') },
      { field: 'Leaf size', value: '2.5–3 ft long, 2–2.8 in wide', source: 'UF foliage research note', url: NOTE('sansevie') },
      pets('toxic to dogs and cats', 'snake-plant'),
    ],
  },
  'zamioculcas-zamiifolia': {
    confidence: 'high',
    overrides: {
      toxicToPets: true,
      light: { dliMin: 0.12, dliLow: 0.25 },
      temperature: { optLowC: 20, optHighC: 32 },
    },
    evidence: [
      { field: 'Minimum interior light', value: 'grows and makes new leaves at 25 fc for more than a year', source: 'UF/IFAS ENH997', url: UF('EP252') },
      { field: 'Production light', value: '1,250–2,500 fc (80–90 % shade)', source: 'UF/IFAS ENH997', url: UF('EP252') },
      { field: 'Temperature', value: 'production 70–90 °F; interior 68–75 °F', source: 'UF/IFAS ENH997', url: UF('EP252') },
      { field: 'Watering', value: 'keep slightly dry; can survive 3 to 4 months without water', source: 'UF/IFAS ENH997', url: UF('EP252') },
      { field: 'Substrate', value: '55–60 % peat with perlite, bark or vermiculite; pH 6.0–7.0', source: 'UF/IFAS ENH997', url: UF('EP252') },
      { field: 'Pets', value: 'not listed by ASPCA; NC State rates it medium toxicity to cats and dogs', source: 'NC State Extension Plant Toolbox', url: NC('zamioculcas-zamiifolia') },
    ],
  },
  spathiphyllum: {
    confidence: 'high',
    overrides: {
      toxicToPets: true,
      light: { dliLow: 0.65, scorchPpfd: 500 },
      temperature: { lethalMinC: 3, damageMinC: 7, growthMinC: 11, optLowC: 20, optHighC: 30, heatStressC: 33, growthMaxC: 38 },
    },
    evidence: [
      interiorMin('75 ft-c'),
      { field: 'Upper light limit', value: 'excess light bleaches leaves; reduce to 2,500 ft-c or below', source: 'UF/IFAS ENH958', url: UF('EP161') },
      { field: 'Temperature', value: 'survives 40–100 °F; maintain 65–90 °F', source: 'UF foliage research note', url: NOTE('spathiph') },
      { field: 'Chilling injury', value: 'visible injury after 5 days at 38 or 45 °F; growth reduced at 52 °F', source: 'UF/IFAS ENH841', url: UF('EP101') },
      { field: 'Watering', value: 'keep moist, not soggy; frequent drooping gives brown tips and edges', source: 'UF/IFAS ENH958', url: UF('EP161') },
      { field: 'Saturated medium', value: 'wilt or collapse with marginal necrosis and sparse roots', source: 'UF/IFAS ENH958', url: UF('EP161') },
      pets('toxic to dogs and cats', 'peace-lily'),
    ],
  },
  aglaonema: {
    confidence: 'high',
    overrides: {},
    evidence: [
      interiorMin('75 ft-c'),
      { field: 'Low-light tolerance', value: 'as low as 25 foot candles; never full sun', source: 'UF/IFAS ENH957', url: UF('EP160') },
      { field: 'Production light', value: '1,250–3,000 fc; at the upper end leaves lose colour', source: 'UF/IFAS ENH957', url: UF('EP160') },
      { field: 'Temperature', value: 'good growth at soil 70–85 °F; limited at 65 °F', source: 'UF foliage research note', url: NOTE('aglaonem') },
      { field: 'Chilling injury', value: "24 h at 55 / 45 / 35 °F injured 30 / 38 / 68 % of 'Silver Queen' leaves", source: 'UF/IFAS ENH843', url: UF('EP103') },
      { field: 'Substrate', value: 'air space 10–20 %, total porosity 50–75 %, pH 6.0–6.5', source: 'UF/IFAS ENH957', url: UF('EP160') },
      { field: 'Leaf size', value: '4–12 in long, 2–4 in wide', source: 'NC State Extension Plant Toolbox', url: NC('aglaonema') },
      pets('toxic to dogs, cats and horses', 'chinese-evergreen'),
    ],
  },
  dieffenbachia: {
    confidence: 'high',
    overrides: {},
    evidence: [
      interiorMin('150 ft-c'),
      { field: 'Cultivar range', value: "some tolerate 50 fc; 'Camille' needs 150–250", source: 'UF/IFAS ENH880', url: UF('EP137') },
      { field: 'Production light', value: '2,500 fc (80 % shade)', source: 'UF/IFAS ENH880', url: UF('EP137') },
      { field: 'Temperature', value: 'production 60–90 °F; interior 70–85 °F', source: 'UF/IFAS ENH880', url: UF('EP137') },
      { field: 'Chilling injury', value: 'may occur below 55 °F', source: 'UF/IFAS ENH880', url: UF('EP137') },
      { field: 'Watering', value: 'keep media moist but not wet', source: 'UF/IFAS ENH880', url: UF('EP137') },
      { field: 'Low humidity', value: 'lower leaves yellow from excess moisture loss', source: 'UF/IFAS ENH880', url: UF('EP137') },
      pets('toxic to dogs and cats', 'dieffenbachia'),
    ],
  },
  'dracaena-fragrans': {
    confidence: 'high',
    overrides: {},
    evidence: [
      interiorMin('150 ft-c'),
      { field: 'Production light', value: '3,250–4,000 fc; plants grown above 4,000 probably will not survive well indoors', source: 'UF foliage research note', url: NOTE('dracaena') },
      { field: 'Temperature', value: 'best growth 65–90 °F; very little below 65 °F; chlorosis above 90 °F', source: 'UF foliage research note', url: NOTE('dracaena') },
      { field: 'Chilling injury', value: 'damaged at 35 °F in 1–2 days or 55 °F in a week; hold at least 50 °F', source: 'UF foliage research note', url: NOTE('dracaena') },
      { field: 'Tip burn', value: 'high boron, fluoride or soluble salts', source: 'UF/IFAS ENH892', url: UF('EP149') },
      { field: 'Leaf size', value: 'up to 18 in long, 3–5 in wide', source: 'NC State Extension Plant Toolbox', url: NC('dracaena-fragrans') },
      pets('toxic to dogs, cats and horses', 'corn-plant'),
    ],
  },
  'goeppertia-orbifolia': {
    confidence: 'high',
    overrides: {
      toxicToPets: false,
      light: { dliMin: 0.65, dliLow: 1.3, scorchPpfd: 400 },
      temperature: { damageMinC: 12, optLowC: 21, optHighC: 30, heatStressC: 32 },
      humidity: { severeBelowRh: 20, stressBelowRh: 35, optLowRh: 45, optHighRh: 90 },
    },
    evidence: [
      interiorMin('150 ft-c (Calathea)'),
      { field: 'Interior light', value: 'tolerates 75 foot candles; optimal 150–200', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      { field: 'Production light', value: '1,000–2,000 ft-c; higher gives tip necrosis and bleaching', source: 'UF foliage research note', url: NOTE('calathea') },
      { field: 'Temperature', value: 'production 70–90 °F; interior 65–80 °F; above 90 °F reduces quality', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      { field: 'Chilling injury', value: 'below 55 °F', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      { field: 'Interior humidity', value: '40–60 %', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      { field: 'Watering', value: 'allow the surface to dry slightly before watering', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      { field: 'Dead spots near margins', value: 'fluoride toxicity', source: 'UF/IFAS ENH1030', url: UF('EP285') },
      pets('non-toxic to dogs, cats and horses (Calathea spp.)', 'calathea'),
    ],
  },
  'ficus-lyrata': {
    confidence: 'medium',
    overrides: { toxicToPets: true, light: { dliLow: 1.3 }, temperature: { damageMinC: 13, optLowC: 21, optHighC: 32, heatStressC: 35 } },
    evidence: [
      interiorMin('150 ft-c'),
      production('2,000–6,000 ft-c'),
      { field: 'Temperature (Ficus genus)', value: 'production 70–95 °F; interior 65–80 °F; keep above 60 °F', source: 'UF/IFAS ENH879', url: UF('EP136') },
      { field: 'Watering', value: 'sensitive to overwatering', source: 'NC State Extension Plant Toolbox', url: NC('ficus-lyrata') },
      { field: 'Leaf size', value: 'up to 18 in long and 12 in wide', source: 'NC State Extension Plant Toolbox', url: NC('ficus-lyrata') },
      { field: 'Pets', value: 'not listed by name; ASPCA lists Ficus sp. as toxic to dogs, cats and horses', source: 'ASPCA Animal Poison Control', url: ASPCA('weeping-fig') },
    ],
  },
  'ficus-elastica': {
    confidence: 'medium',
    overrides: { toxicToPets: true, leaf: { aspect: 0.42 }, temperature: { damageMinC: 13, optLowC: 21, optHighC: 32, heatStressC: 35 } },
    evidence: [
      { field: 'Interior light (acclimatised Ficus)', value: '100–200 foot candles', source: 'UF/IFAS ENH879', url: UF('EP136') },
      production('4,000–8,000 ft-c'),
      { field: 'Temperature', value: 'production 70–95 °F; interior 65–80 °F; keep above 60 °F', source: 'UF/IFAS ENH879', url: UF('EP136') },
      { field: 'Low humidity', value: 'dry and shrivelled leaves', source: 'UF/IFAS ENH879', url: UF('EP136') },
      { field: 'Leaf size', value: 'to 17 in long and 6 in wide', source: 'NC State Extension Plant Toolbox', url: NC('ficus-elastica') },
      { field: 'Pets', value: 'not listed by name; ASPCA lists Ficus sp. as toxic to dogs, cats and horses', source: 'ASPCA Animal Poison Control', url: ASPCA('weeping-fig') },
    ],
  },
  'chlorophytum-comosum': {
    confidence: 'medium',
    overrides: { toxicToPets: false, leaf: { aspect: 0.08 }, temperature: { lethalMinC: -1, damageMinC: 2, growthMinC: 12, optLowC: 21, optHighC: 32 } },
    evidence: [
      production('1,000–2,500 ft-c'),
      { field: 'Interior light class', value: 'medium to high (minimum 75–150 ft-c)', source: 'University of Georgia Bulletin 1318', url: UGA },
      { field: 'Temperature', value: 'best 70–90 °F; tolerates 35 °F without damage; little growth below 65 °F', source: 'UF foliage research note', url: NOTE('spider') },
      { field: 'Tip burn', value: 'fluoride or boron toxicity', source: 'UF foliage research note', url: NOTE('spider') },
      { field: 'Leaf size', value: '12–18 in long', source: 'NC State Extension Plant Toolbox', url: NC('chlorophytum-comosum') },
      pets('non-toxic to dogs and cats', 'spider-plant'),
    ],
  },
  'nephrolepis-exaltata': {
    confidence: 'medium',
    overrides: { toxicToPets: false, light: { dliMin: 0.65, dliLow: 1.3 }, temperature: { optLowC: 18, optHighC: 32, heatStressC: 35 }, growth: { matureLeafCm: 70 } },
    evidence: [
      interiorMin('150 ft-c'),
      { field: 'Production light', value: 'best quality near 2,000 ft-c; too much light turns fronds light green', source: 'UF foliage research note', url: NOTE('bostonF') },
      { field: 'Temperature', value: '65 °F minimum and 95 °F maximum for best growth', source: 'UF foliage research note', url: NOTE('bostonF') },
      { field: 'Watering', value: 'keep moist all the time; turns grey without enough water', source: 'UF foliage research note', url: NOTE('bostonF') },
      { field: 'Frond length', value: '2–3 ft', source: 'NC State Extension Plant Toolbox', url: NC('nephrolepis-exaltata') },
      pets('non-toxic to dogs and cats', 'boston-fern'),
    ],
  },
  'monstera-deliciosa': {
    confidence: 'low',
    overrides: { toxicToPets: true },
    evidence: [
      production('2,000–4,000 ft-c'),
      { field: 'Interior light class', value: 'low to high (no minimum published)', source: 'University of Georgia Bulletin 1318', url: UGA },
      { field: 'Temperature', value: 'average warm, 60–85 °F', source: 'NC State Extension Plant Toolbox', url: NC('monstera-deliciosa') },
      { field: 'Watering', value: 'water thoroughly, then let the top quarter to third dry', source: 'NC State Extension Plant Toolbox', url: NC('monstera-deliciosa') },
      pets('toxic to dogs and cats', 'cutleaf-philodendron'),
    ],
  },
  echeveria: {
    confidence: 'low',
    overrides: { toxicToPets: false },
    evidence: [
      { field: 'Interior light class', value: 'sunny to high (4 h direct sun, or over 200 ft-c)', source: 'University of Georgia Bulletin 1318', url: UGA },
      { field: 'Watering', value: 'needs little water; overwatering is the most common problem', source: 'NC State Extension Plant Toolbox', url: NC('echeveria') },
      { field: 'Leaf size (E. elegans)', value: 'up to 2.5 in long and 0.8 in wide', source: 'NC State Extension Plant Toolbox', url: NC('echeveria-elegans') },
      pets('non-toxic to dogs, cats and horses', 'blue-echeveria'),
    ],
  },
}
