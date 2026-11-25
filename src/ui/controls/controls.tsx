import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const decimals = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2)

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="label-caps">{title}</h3>
        {aside}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  )
}

interface NumberInputProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  disabled?: boolean
  width?: number
  ariaLabel?: string
}

/** Type-in numeric entry. Commits on Enter or blur, steps with the arrow keys, clamps to range. */
export function NumberInput({ value, min, max, step = 1, onChange, disabled, width = 52, ariaLabel }: NumberInputProps) {
  const dp = decimals(step)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    const v = parseFloat(raw.replace(',', '.'))
    if (Number.isFinite(v)) onChange(clamp(parseFloat(v.toFixed(dp)), min, max))
    setDraft(null)
  }
  return (
    <input
      aria-label={ariaLabel}
      className="num h-[22px] rounded-[3px] border border-line bg-surface px-1.5 text-right text-[12px] focus:border-forest disabled:opacity-50"
      style={{ width, userSelect: 'text' }}
      inputMode="decimal"
      disabled={disabled}
      value={draft ?? value.toFixed(dp)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => draft !== null && commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value)
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const dir = e.key === 'ArrowUp' ? 1 : -1
          const base = parseFloat(draft ?? String(value))
          const next = clamp(parseFloat(((Number.isFinite(base) ? base : value) + dir * step * (e.shiftKey ? 10 : 1)).toFixed(dp)), min, max)
          setDraft(null)
          onChange(next)
        }
      }}
    />
  )
}

interface NumberFieldProps extends NumberInputProps {
  label: string
  unit?: string
  defaultValue?: number
  hint?: ReactNode
}

/** Slider and exact numeric entry for the same value, with units and reset. */
export function NumberField({ label, unit, defaultValue, hint, ...p }: NumberFieldProps) {
  const fill = ((clamp(p.value, p.min, p.max) - p.min) / (p.max - p.min)) * 100
  const canReset = defaultValue !== undefined && Math.abs(defaultValue - p.value) > 1e-9
  return (
    <div className={p.disabled ? 'opacity-60' : ''}>
      <div className="flex items-center gap-1.5">
        <label className="flex-1 truncate text-ink-2">{label}</label>
        {defaultValue !== undefined && (
          <button
            type="button"
            title={`Reset to ${defaultValue}${unit ? ` ${unit}` : ''}`}
            disabled={!canReset || p.disabled}
            onClick={() => p.onChange(defaultValue)}
            className="grid h-[18px] w-[18px] place-items-center rounded-[3px] text-ink-3 hover:bg-sunken hover:text-ink disabled:invisible"
          >
            <RotateCcw size={11} />
          </button>
        )}
        <NumberInput {...p} ariaLabel={label} />
        <span className="num w-[62px] shrink-0 truncate text-[10.5px] text-ink-3">{unit}</span>
      </div>
      <input
        type="range"
        className="slider mt-1"
        aria-label={`${label} slider`}
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        value={p.value}
        disabled={p.disabled}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => p.onChange(parseFloat(e.target.value))}
      />
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{hint}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex rounded-[4px] border border-line bg-sunken p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-[22px] flex-1 truncate rounded-[3px] px-2 text-[12px] transition-colors ${
            o.value === value ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line-strong)]' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <label className="flex cursor-pointer items-center gap-2">
        <span className="flex-1 text-ink-2">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-[16px] w-[28px] rounded-full border transition-colors ${checked ? 'border-forest bg-forest' : 'border-line-strong bg-sunken'}`}
        >
          <span className={`absolute top-[1.5px] h-[11px] w-[11px] rounded-full bg-surface transition-all ${checked ? 'left-[13.5px]' : 'left-[1.5px] bg-ink-3'}`} />
        </button>
      </label>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{hint}</div>}
    </div>
  )
}

export function Readout({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-forest' : tone === 'warn' ? 'text-amber' : tone === 'bad' ? 'text-rust' : 'text-ink'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span className={`num text-right text-[12px] ${color}`}>{value}</span>
    </div>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p className={`rounded-[3px] border-l-2 px-2 py-1.5 text-[11.5px] leading-snug ${tone === 'warn' ? 'border-amber bg-[#f3ead6] text-[#5e4712]' : 'border-line-strong bg-sunken text-ink-2'}`}>
      {children}
    </p>
  )
}

export function ChoiceGrid<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T | null
  options: { value: T; label: string; note?: string; swatch?: string }[]
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-2 rounded-[4px] border px-2 py-1.5 text-left transition-colors ${
            o.value === value ? 'border-forest bg-forest-soft' : 'border-line bg-surface hover:border-line-strong'
          }`}
        >
          {o.swatch && <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15" style={{ background: o.swatch }} />}
          <span className="min-w-0">
            <span className="block truncate font-medium leading-tight">{o.label}</span>
            {o.note && <span className="block truncate text-[10.5px] leading-tight text-ink-3">{o.note}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Horizontal 0–100 score bar. */
export function ScoreBar({ value, height = 4 }: { value: number; height?: number }) {
  const color = value >= 75 ? 'var(--color-forest)' : value >= 55 ? 'var(--color-amber)' : 'var(--color-rust)'
  return (
    <div className="w-full overflow-hidden rounded-full bg-line" style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${clamp(value, 0, 100)}%`, background: color }} />
    </div>
  )
}

/** Dropdown menu anchored to a toolbar button. Closes on outside click or Escape. */
export function Menu({ trigger, children, align = 'left', width = 220 }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={`rise absolute top-[calc(100%+4px)] z-50 rounded-[5px] border border-line-strong bg-surface py-1 shadow-[0_6px_20px_rgba(34,39,31,0.14)] ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
