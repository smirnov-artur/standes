import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// ── Field: строка «подпись — контрол» ───────────────────────────────────────

export function Field({
  label,
  hint,
  children,
  wide,
  className,
}: {
  label?: ReactNode
  hint?: string
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  if (wide) {
    return (
      <div className={clsx('flex flex-col gap-1.5 px-3 py-1.5', className)}>
        {label && <div className="label">{label}</div>}
        {children}
        {hint && (
          <div className="text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
            {hint}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={clsx('flex min-h-[26px] items-center gap-2 px-3 py-[3px]', className)}>
      <div className="w-[86px] shrink-0 truncate text-[11.5px]" style={{ color: 'var(--text-dim)' }} title={hint}>
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  )
}

// ── NumberField: инпут со скрабом мышью ─────────────────────────────────────

export interface NumberFieldProps {
  value: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  min?: number
  max?: number
  step?: number
  /** шаг при перетаскивании: сколько единиц на пиксель */
  scrub?: number
  suffix?: string
  precision?: number
  disabled?: boolean
  className?: string
  /** показать мини-полоску заполнения диапазона */
  bar?: boolean
}

export function NumberField({
  value,
  onChange,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  scrub,
  suffix,
  precision = 0,
  disabled,
  className,
  bar,
}: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const startRef = useRef({ x: 0, v: 0, moved: false })

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max])
  const shown = text ?? (Number.isFinite(value) ? value.toFixed(precision) : '—')

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'))
    setText(null)
    if (!Number.isFinite(parsed)) return
    const v = clamp(parsed)
    onChange(v)
    onCommit?.(v)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    if (e.button !== 0) return
    startRef.current = { x: e.clientX, v: value, moved: false }
    const perPx = scrub ?? Math.max(step, (Number.isFinite(max - min) ? (max - min) / 400 : step))
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startRef.current.x
      if (!startRef.current.moved && Math.abs(dx) < 3) return
      if (!startRef.current.moved) {
        startRef.current.moved = true
        setDragging(true)
        document.body.style.cursor = 'ew-resize'
      }
      const mult = ev.shiftKey ? 0.15 : ev.altKey ? 4 : 1
      const raw = startRef.current.v + dx * perPx * mult
      onChange(clamp(Math.round(raw / step) * step))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      if (startRef.current.moved) onCommit?.(value)
      else ref.current?.select()
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pct =
    bar && Number.isFinite(min) && Number.isFinite(max) && max > min
      ? Math.min(1, Math.max(0, (value - min) / (max - min)))
      : null

  return (
    <div
      className={clsx('relative flex h-[24px] min-w-0 flex-1 items-center rounded-[5px]', className)}
      style={{
        background: 'var(--bg-input)',
        border: `1px solid ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {pct !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[4px]"
          style={{ width: `${pct * 100}%`, background: 'color-mix(in oklab, var(--accent) 13%, transparent)' }}
        />
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value)
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setText(null)
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const v = clamp(value + d)
            onChange(v)
            onCommit?.(v)
          }
        }}
        onPointerDown={onPointerDown}
        className="num relative z-[1] w-full cursor-ew-resize bg-transparent px-1.5 outline-none"
        style={{ color: 'var(--text)' }}
      />
      {suffix && (
        <span
          className="num relative z-[1] shrink-0 pr-1.5 text-[10px] select-none"
          style={{ color: 'var(--text-faint)' }}
        >
          {suffix}
        </span>
      )}
    </div>
  )
}

// ── Slider ──────────────────────────────────────────────────────────────────

export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const pct = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0

  const setFromEvent = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const raw = min + t * (max - min)
    onChange(Math.round(raw / step) * step)
  }

  return (
    <div
      ref={trackRef}
      className={clsx('relative h-[22px] min-w-0 flex-1 cursor-pointer', disabled && 'pointer-events-none opacity-40')}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        setDrag(true)
        setFromEvent(e.clientX)
      }}
      onPointerMove={(e) => drag && setFromEvent(e.clientX)}
      onPointerUp={() => {
        setDrag(false)
        onCommit?.(value)
      }}
    >
      <div
        className="absolute top-1/2 h-[4px] w-full -translate-y-1/2 rounded-full"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full"
        style={{ width: `${pct * 100}%`, background: 'var(--accent)' }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-[12px] w-[12px] rounded-full transition-transform duration-100"
        style={{
          left: `calc(${pct * 100}% - 6px)`,
          transform: `translateY(-50%) scale(${drag ? 1.25 : 1})`,
          background: 'var(--text)',
          boxShadow: 'var(--shadow-sm)',
        }}
      />
    </div>
  )
}

// ── TextField ───────────────────────────────────────────────────────────────

export function TextField({
  value,
  onChange,
  placeholder,
  disabled,
  mono,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  mono?: boolean
  onEnter?: () => void
}) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onEnter?.()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={clsx(
        'focus-ring h-[24px] min-w-0 flex-1 rounded-[5px] px-1.5 text-[12px] outline-none',
        mono && 'num',
      )}
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        opacity: disabled ? 0.45 : 1,
      }}
    />
  )
}

// ── Select ──────────────────────────────────────────────────────────────────

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="relative flex min-w-0 flex-1">
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value
          const found = options.find((o) => String(o.value) === raw)
          if (found) onChange(found.value)
        }}
        className="focus-ring h-[24px] w-full cursor-pointer appearance-none rounded-[5px] pr-6 pl-1.5 text-[12px] outline-none"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} style={{ background: 'var(--bg-elevated)' }}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2"
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        style={{ color: 'var(--text-faint)' }}
      >
        <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ── Стрелочный степпер для целых (кол-во колонок/рядов и т.п.) ──────────────

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)))
  return (
    <div
      className="flex h-[24px] min-w-0 flex-1 items-center overflow-hidden rounded-[5px]"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        className="h-full w-[22px] shrink-0 text-[13px] leading-none transition-colors disabled:opacity-25"
        style={{ color: 'var(--text-dim)' }}
        onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        −
      </button>
      <div className="num flex-1 text-center" style={{ color: 'var(--text)' }}>
        {value}
        {suffix && <span style={{ color: 'var(--text-faint)' }}> {suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className="h-full w-[22px] shrink-0 text-[13px] leading-none transition-colors disabled:opacity-25"
        style={{ color: 'var(--text-dim)' }}
        onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        +
      </button>
    </div>
  )
}

// ── Section: сворачиваемый блок инспектора ──────────────────────────────────

export function Section({
  title,
  children,
  right,
  defaultOpen = true,
  icon,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
  defaultOpen?: boolean
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div
        className="flex h-[30px] cursor-pointer items-center gap-1.5 px-2.5 select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 10 10"
          fill="none"
          className="shrink-0 transition-transform duration-150"
          style={{ color: 'var(--text-faint)', transform: open ? 'rotate(90deg)' : 'none' }}
        >
          <path d="M3.5 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {icon}
        <span className="label flex-1">{title}</span>
        <div onClick={(e) => e.stopPropagation()}>{right}</div>
      </div>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

/** Хук: значение, которое коммитится в стор не чаще, чем раз в кадр */
export function useThrottledCommit<T>(commit: (v: T) => void) {
  const raf = useRef<number | null>(null)
  const pending = useRef<T | null>(null)
  useEffect(() => () => void (raf.current && cancelAnimationFrame(raf.current)), [])
  return useCallback(
    (v: T) => {
      pending.current = v
      if (raf.current !== null) return
      raf.current = requestAnimationFrame(() => {
        raf.current = null
        if (pending.current !== null) commit(pending.current)
      })
    },
    [commit],
  )
}
