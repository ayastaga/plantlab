import { useLab } from '../store/useLab'
import { AtmospherePanel, TemperaturePanel, WateringPanel } from './panels/EnvironmentPanels'
import { GrowLightList, GrowLightPanel, SunPanel } from './panels/LightPanels'
import { EnvironmentPanel, PlantPanel } from './panels/PlantPanels'
import { MediumPanel, PotPanel } from './panels/PotMediumPanels'
import { Checkup } from './Checkup'
import { Results } from './Results'
import { nodeLabel } from './tree'

export function Panel({ selection }: { selection: string | null }) {
  if (selection?.startsWith('light:')) return <GrowLightPanel id={selection.slice(6)} />
  switch (selection) {
    case 'sun':
      return <SunPanel />
    case 'lights':
      return <GrowLightList />
    case 'atmosphere':
      return <AtmospherePanel />
    case 'temperature':
      return <TemperaturePanel />
    case 'watering':
    case 'feeding':
      return <WateringPanel />
    case 'pot':
      return <PotPanel />
    case 'medium':
      return <MediumPanel />
    case 'plant':
    case 'leaves':
    case 'stems':
    case 'roots':
      return <PlantPanel part={selection} />
    default:
      return <EnvironmentPanel />
  }
}

export function RightSidebar() {
  const tab = useLab((s) => s.rightTab)
  const setTab = useLab((s) => s.setRightTab)
  const selection = useLab((s) => s.selection)
  const config = useLab((s) => s.experiment.config)
  const result = useLab((s) => s.result)
  const stale = useLab((s) => s.stale)
  const title = selection ? nodeLabel(config, selection) : 'Environment'

  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
      <div role="tablist" className="flex h-[30px] shrink-0 border-b border-line">
        {(
          [
            ['properties', 'Properties'],
            ['results', 'Results'],
            ['checkup', 'Check-up'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`label-caps relative flex flex-1 items-center justify-center gap-1.5 ${tab === id ? 'text-ink' : 'hover:text-ink-2'}`}
          >
            {label}
            {id === 'results' && result && (
              <span className={`num rounded-[3px] px-1 text-[10.5px] tracking-normal ${stale ? 'bg-line text-ink-3' : 'bg-forest text-surface'}`}>{result.overall}</span>
            )}
            {tab === id && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-forest" />}
          </button>
        ))}
      </div>
      {tab === 'properties' ? (
        <>
          <div className="flex h-[34px] shrink-0 items-center border-b border-line px-3">
            <h2 className="truncate font-semibold text-[18px] leading-none">{title}</h2>
          </div>
          <div className="scroll min-h-0 flex-1" key={selection ?? 'env'}>
            <Panel selection={selection} />
          </div>
        </>
      ) : tab === 'results' ? (
        <Results />
      ) : (
        <Checkup />
      )}
    </aside>
  )
}
