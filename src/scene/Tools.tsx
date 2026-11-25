import { useEffect, useState, type ReactNode } from 'react'
import { useLab, useSnapshot } from '../store/useLab'
import { SELECT_COLOR } from './util'

export interface ToolTip {
  label: string
  hint: string
  x: number
  y: number
}

interface ToolDef {
  /** Scene object this tool edits (matches the properties panels) */
  target: string
  label: string
  hint: string
  position: [number, number, number]
  rotation?: number
  /** Opens the check-up tab instead of a properties panel */
  checkup?: boolean
}

/** Tools laid out along the potting bench, either side of the plant at the origin. */
export const TOOLS: ToolDef[] = [
  { target: 'medium', label: 'Soil bag', hint: 'What it is planted in', position: [-0.98, 0, -0.03], rotation: 0.25 },
  { target: 'pot', label: 'Spare pots', hint: 'Pot size, material and drainage', position: [-0.62, 0, 0.04] },
  { target: 'checkup', label: 'Trowel', hint: 'Check up on a real plant', position: [-0.36, 0, 0.17], rotation: -0.5, checkup: true },
  { target: 'lights', label: 'Grow lamp', hint: 'Add or adjust a grow light', position: [-0.3, 0, -0.19], rotation: 0.5 },
  { target: 'watering', label: 'Watering can', hint: 'How often and how much', position: [0.42, 0, 0.04], rotation: 2.5 },
  { target: 'atmosphere', label: 'Mister', hint: 'Humidity', position: [0.68, 0, 0.14] },
  { target: 'feeding', label: 'Fertiliser', hint: 'Feeding', position: [0.86, 0, -0.08] },
  { target: 'temperature', label: 'Thermometer', hint: 'Temperature', position: [1.06, 0, 0.04] },
]

function Mat({ color, on, rough = 0.8, metal = 0 }: { color: string; on: boolean; rough?: number; metal?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={SELECT_COLOR} emissiveIntensity={on ? 0.45 : 0} />
}

function Shape({ target, on, level }: { target: string; on: boolean; level: number }) {
  switch (target) {
    case 'medium':
      // a slumped paper sack with a rolled top
      return (
        <>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.2, 0.22, 0.12]} />
            <Mat color="#b99a6b" on={on} rough={1} />
          </mesh>
          <mesh position={[0, 0.235, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
            <Mat color="#a88958" on={on} rough={1} />
          </mesh>
          <mesh position={[0, 0.12, 0.062]}>
            <boxGeometry args={[0.11, 0.09, 0.002]} />
            <Mat color="#3f6a37" on={on} />
          </mesh>
        </>
      )
    case 'pot':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.045 + i * 0.045, 0]} castShadow>
              <cylinderGeometry args={[0.085 - i * 0.004, 0.06 - i * 0.004, 0.09, 10]} />
              <Mat color={i === 1 ? '#a85c38' : '#b9673e'} on={on} rough={0.95} />
            </mesh>
          ))}
        </>
      )
    case 'checkup':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0, 0.014, 0]}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.013, 0.015, 0.1, 8]} />
            <Mat color="#7a5236" on={on} />
          </mesh>
          <mesh position={[0, -0.05, 0]} scale={[1, 1, 0.25]} castShadow>
            <coneGeometry args={[0.035, 0.14, 8]} />
            <Mat color="#9aa0a3" on={on} rough={0.35} metal={0.8} />
          </mesh>
        </group>
      )
    case 'lights':
      // clamp lamp with an arm reaching toward the plant
      return (
        <>
          <mesh position={[0, 0.012, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.06, 0.024, 16]} />
            <Mat color="#2f302d" on={on} rough={0.5} metal={0.4} />
          </mesh>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.007, 0.007, 0.38, 6]} />
            <Mat color="#2f302d" on={on} rough={0.5} metal={0.4} />
          </mesh>
          <mesh position={[0.07, 0.4, 0]} rotation={[0, 0, -1.05]} castShadow>
            <cylinderGeometry args={[0.007, 0.007, 0.17, 6]} />
            <Mat color="#2f302d" on={on} rough={0.5} metal={0.4} />
          </mesh>
          <mesh position={[0.16, 0.42, 0]} rotation={[0, 0, 0.6]} castShadow>
            <coneGeometry args={[0.06, 0.09, 12, 1, true]} />
            <Mat color="#d6b24c" on={on} rough={0.4} metal={0.5} />
          </mesh>
        </>
      )
    case 'watering':
      return (
        <>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.058, 0.12, 14]} />
            <Mat color="#5d8c6a" on={on} rough={0.45} metal={0.3} />
          </mesh>
          <mesh position={[0.085, 0.085, 0]} rotation={[0, 0, -0.95]} castShadow>
            <cylinderGeometry args={[0.007, 0.012, 0.15, 8]} />
            <Mat color="#5d8c6a" on={on} rough={0.45} metal={0.3} />
          </mesh>
          <mesh position={[-0.058, 0.075, 0]} castShadow>
            <torusGeometry args={[0.038, 0.005, 6, 14, Math.PI]} />
            <Mat color="#3f6249" on={on} rough={0.5} metal={0.3} />
          </mesh>
        </>
      )
    case 'atmosphere':
      // spray bottle
      return (
        <>
          <mesh position={[0, 0.055, 0]} castShadow>
            <cylinderGeometry args={[0.032, 0.036, 0.11, 12]} />
            <meshStandardMaterial color="#bfe3ea" roughness={0.15} transparent opacity={0.75} emissive={SELECT_COLOR} emissiveIntensity={on ? 0.45 : 0} />
          </mesh>
          <mesh position={[0, 0.125, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.02, 0.03, 10]} />
            <Mat color="#e9e5db" on={on} />
          </mesh>
          <mesh position={[0.018, 0.15, 0]} castShadow>
            <boxGeometry args={[0.06, 0.022, 0.022]} />
            <Mat color="#e9e5db" on={on} />
          </mesh>
        </>
      )
    case 'feeding':
      return (
        <>
          <mesh position={[0, 0.06, 0]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.04]} />
            <Mat color="#3f7a45" on={on} rough={0.4} />
          </mesh>
          <mesh position={[0, 0.135, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.03, 8]} />
            <Mat color="#d9c64f" on={on} rough={0.5} />
          </mesh>
          <mesh position={[0, 0.062, 0.0205]}>
            <boxGeometry args={[0.044, 0.05, 0.001]} />
            <Mat color="#f1e7c6" on={on} />
          </mesh>
        </>
      )
    default:
      // thermometer on a small stand: the column height is the simulated temperature
      return (
        <>
          <mesh position={[0, 0.008, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.016, 16]} />
            <Mat color="#d8d3c7" on={on} />
          </mesh>
          <mesh position={[0, 0.15, -0.006]} castShadow>
            <boxGeometry args={[0.034, 0.27, 0.005]} />
            <Mat color="#f4f1ea" on={on} />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <sphereGeometry args={[0.011, 10, 8]} />
            <meshStandardMaterial color="#c8452f" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.04 + (0.225 * level) / 2, 0]}>
            <cylinderGeometry args={[0.0042, 0.0042, 0.225 * level, 8]} />
            <meshStandardMaterial color="#c8452f" roughness={0.3} />
          </mesh>
        </>
      )
  }
}

function Tool({ def, onTip, children }: { def: ToolDef; onTip: (tip: ToolTip | null) => void; children?: ReactNode }) {
  const [hover, setHover] = useState(false)
  const select = useLab((s) => s.select)
  const setRightTab = useLab((s) => s.setRightTab)
  const addGrowLight = useLab((s) => s.addGrowLight)
  const selected = useLab((s) => (def.checkup ? s.rightTab === 'checkup' : s.selection === def.target || (def.target === 'lights' && !!s.selection?.startsWith('light:'))))
  const snap = useSnapshot()
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover])
  const level = Math.min(1, Math.max(0.03, (snap.env.tMeanC + 5) / 50))
  return (
    <group
      position={def.position}
      rotation={[0, def.rotation ?? 0, 0]}
      scale={hover ? 1.08 : 1}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        onTip({ label: def.label, hint: def.hint, x: e.clientX, y: e.clientY })
      }}
      onPointerOut={() => {
        setHover(false)
        onTip(null)
      }}
      onClick={(e) => {
        e.stopPropagation()
        onTip(null)
        if (def.checkup) setRightTab('checkup')
        else if (def.target === 'lights' && useLab.getState().experiment.config.light.growLights.length === 0) addGrowLight()
        else select(def.target)
      }}
    >
      <Shape target={def.target} on={selected || hover} level={level} />
      {children}
    </group>
  )
}

/** The potting bench's tools. Each one is a handle for a setting; clicking it opens that setting in the panel. */
export function Tools({ onTip }: { onTip: (tip: ToolTip | null) => void }) {
  return (
    <group>
      {TOOLS.map((def) => (
        <Tool key={def.target} def={def} onTip={onTip} />
      ))}
    </group>
  )
}
