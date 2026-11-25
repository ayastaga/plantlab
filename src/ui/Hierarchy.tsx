import { useState } from 'react'
import {
  Box,
  ChevronDown,
  ChevronRight,
  CloudFog,
  Copy,
  Droplets,
  Eye,
  EyeOff,
  Globe,
  Lamp,
  Layers,
  Leaf,
  Lightbulb,
  Plus,
  Spline,
  Sprout,
  Sun,
  Thermometer,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { isHidden, useLab } from '../store/useLab'
import { buildTree, type NodeIcon, type TreeNode } from './tree'

const ICONS: Record<NodeIcon, typeof Box> = {
  environment: Globe,
  atmosphere: CloudFog,
  temperature: Thermometer,
  watering: Droplets,
  plant: Sprout,
  leaves: Leaf,
  stems: Spline,
  roots: Waypoints,
  pot: Box,
  medium: Layers,
  sun: Sun,
  lights: Lamp,
  light: Lightbulb,
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const selection = useLab((s) => s.selection)
  const hidden = useLab((s) => s.hidden)
  const expanded = useLab((s) => s.expanded[node.id] ?? false)
  const select = useLab((s) => s.select)
  const toggleHidden = useLab((s) => s.toggleHidden)
  const toggleExpanded = useLab((s) => s.toggleExpanded)
  const rename = useLab((s) => s.rename)
  const addGrowLight = useLab((s) => s.addGrowLight)
  const duplicateGrowLight = useLab((s) => s.duplicateGrowLight)
  const removeGrowLight = useLab((s) => s.removeGrowLight)
  const [editing, setEditing] = useState(false)

  const Icon = ICONS[node.icon]
  const isSelected = selection === node.id
  const selfHidden = !!hidden[node.id]
  const effectiveHidden = isHidden(hidden, node.id)
  const hasChildren = node.children !== undefined
  const lightId = node.id.startsWith('light:') ? node.id.slice(6) : null

  return (
    <li role="treeitem" aria-selected={isSelected} aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className={`group flex h-[25px] items-center gap-1 pr-1.5 ${isSelected ? 'bg-forest text-surface' : 'hover:bg-sunken'} ${effectiveHidden && !isSelected ? 'text-ink-3' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => select(node.id)}
        onDoubleClick={() => setEditing(true)}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(node.id)
            }}
            className="grid h-4 w-4 shrink-0 place-items-center opacity-70 hover:opacity-100"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Icon size={13} className={`shrink-0 ${isSelected ? '' : 'text-ink-2'}`} strokeWidth={1.75} />
        {editing ? (
          <input
            autoFocus
            defaultValue={node.label}
            aria-label="Rename object"
            className="h-[19px] min-w-0 flex-1 rounded-[2px] border border-forest bg-surface px-1 text-ink"
            style={{ userSelect: 'text' }}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              rename(node.id, e.target.value)
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" title="Double-click to rename">
            {node.label}
          </span>
        )}
        <span className={`flex shrink-0 items-center gap-0.5 ${isSelected || selfHidden ? '' : 'opacity-0 group-hover:opacity-100'}`}>
          {node.id === 'lights' && (
            <button
              type="button"
              title="Add a grow light"
              aria-label="Add a grow light"
              onClick={(e) => {
                e.stopPropagation()
                addGrowLight()
              }}
              className="grid h-[18px] w-[18px] place-items-center rounded-[2px] opacity-70 hover:opacity-100"
            >
              <Plus size={12} />
            </button>
          )}
          {lightId && (
            <>
              <button
                type="button"
                title="Duplicate"
                aria-label={`Duplicate ${node.label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateGrowLight(lightId)
                }}
                className="grid h-[18px] w-[18px] place-items-center rounded-[2px] opacity-70 hover:opacity-100"
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                title="Remove"
                aria-label={`Remove ${node.label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeGrowLight(lightId)
                }}
                className="grid h-[18px] w-[18px] place-items-center rounded-[2px] opacity-70 hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
          {node.hideable && (
            <button
              type="button"
              title={selfHidden ? 'Show in viewport' : 'Hide in viewport'}
              aria-label={`${selfHidden ? 'Show' : 'Hide'} ${node.label}`}
              aria-pressed={selfHidden}
              onClick={(e) => {
                e.stopPropagation()
                toggleHidden(node.id)
              }}
              className="grid h-[18px] w-[18px] place-items-center rounded-[2px] opacity-70 hover:opacity-100"
            >
              {selfHidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
        </span>
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {node.children!.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
          {node.id === 'lights' && node.children!.length === 0 && (
            <li className="py-1 text-[11.5px] text-ink-3" style={{ paddingLeft: 6 + (depth + 1) * 14 + 20 }}>
              No grow lights
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

export function Hierarchy() {
  const config = useLab((s) => s.experiment.config)
  const tree = buildTree(config)
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="flex h-[30px] shrink-0 items-center border-b border-line px-3">
        <h2 className="label-caps">Scene</h2>
      </div>
      <ul role="tree" aria-label="Scene objects" className="scroll flex-1 py-1">
        {tree.map((n) => (
          <Node key={n.id} node={n} depth={0} />
        ))}
      </ul>
      <div className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-ink-3">
        Click to select · double-click to rename · the eye hides an object in the viewport only.
      </div>
    </aside>
  )
}
