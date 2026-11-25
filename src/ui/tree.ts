import type { ExperimentConfig } from '../sim/types'

export type NodeIcon = 'environment' | 'atmosphere' | 'temperature' | 'watering' | 'plant' | 'leaves' | 'stems' | 'roots' | 'pot' | 'medium' | 'sun' | 'lights' | 'light'

export interface TreeNode {
  id: string
  label: string
  icon: NodeIcon
  children?: TreeNode[]
  /** Optional objects can be duplicated and removed. */
  optional?: boolean
  /** Hiding only affects what is drawn, never the simulation. */
  hideable?: boolean
}

const DEFAULT_LABELS: Record<string, string> = {
  environment: 'Environment',
  atmosphere: 'Humidity',
  temperature: 'Temperature',
  watering: 'Watering',
  plant: 'Plant',
  leaves: 'Leaves',
  stems: 'Stems',
  roots: 'Roots',
  pot: 'Pot',
  medium: 'Growing medium',
  sun: 'Sunlight',
  lights: 'Additional light sources',
  feeding: 'Feeding',
}

export function nodeLabel(config: ExperimentConfig, id: string): string {
  if (id.startsWith('light:')) return config.light.growLights.find((g) => `light:${g.id}` === id)?.name ?? 'Grow light'
  return config.names[id] ?? DEFAULT_LABELS[id] ?? id
}

export function buildTree(config: ExperimentConfig): TreeNode[] {
  const n = (id: string, icon: NodeIcon, extra: Partial<TreeNode> = {}): TreeNode => ({ id, icon, label: nodeLabel(config, id), hideable: true, ...extra })
  return [
    n('environment', 'environment', {
      hideable: false,
      children: [n('atmosphere', 'atmosphere'), n('temperature', 'temperature'), n('watering', 'watering')],
    }),
    n('plant', 'plant', { children: [n('leaves', 'leaves'), n('stems', 'stems'), n('roots', 'roots')] }),
    n('pot', 'pot'),
    n('medium', 'medium'),
    n('sun', 'sun'),
    n('lights', 'lights', {
      children: config.light.growLights.map((g) => n(`light:${g.id}`, 'light', { optional: true })),
    }),
  ]
}
