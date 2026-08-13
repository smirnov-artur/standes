import clsx from 'clsx'
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'xs' | 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  icon?: ReactNode
  full?: boolean
}

const BTN_SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-[5px]',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'sm', active, icon, full, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx(
        'focus-ring inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-120',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40',
        BTN_SIZE[size],
        full && 'w-full',
        className,
      )}
      style={{
        background:
          variant === 'primary'
            ? 'var(--accent)'
            : variant === 'danger'
              ? 'color-mix(in oklab, var(--danger) 16%, var(--bg-elevated))'
              : variant === 'ghost' || variant === 'quiet'
                ? active
                  ? 'var(--bg-active)'
                  : 'transparent'
                : active
                  ? 'var(--bg-active)'
                  : 'var(--bg-elevated)',
        color:
          variant === 'primary'
            ? 'var(--accent-ink)'
            : variant === 'danger'
              ? 'var(--danger)'
              : active
                ? 'var(--text)'
                : variant === 'quiet'
                  ? 'var(--text-dim)'
                  : 'var(--text)',
        border:
          variant === 'ghost' || variant === 'quiet'
            ? '1px solid transparent'
            : variant === 'primary'
              ? '1px solid var(--accent)'
              : `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
        boxShadow: variant === 'primary' ? '0 1px 0 rgb(255 255 255 / 0.18) inset' : undefined,
      }}
      onPointerEnter={(e) => {
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--accent-hi)'
        else if (!active) el.style.background = 'var(--bg-hover)'
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--accent)'
        else if (!active)
          el.style.background =
            variant === 'ghost' || variant === 'quiet' ? 'transparent' : 'var(--bg-elevated)'
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonProps {
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'sm', className, children, ...rest },
  ref,
) {
  return (
    <Tooltip content={label}>
      <Button
        ref={ref}
        size={size}
        aria-label={label}
        className={clsx(
          size === 'xs' ? 'w-6 px-0' : size === 'sm' ? 'w-7 px-0' : 'w-8 px-0',
          className,
        )}
        {...rest}
      >
        {children}
      </Button>
    </Tooltip>
  )
})

// ── Toggle ──────────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="focus-ring relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40"
      style={{
        background: checked ? 'var(--accent)' : 'var(--bg-input)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
      }}
    >
      <span
        className="absolute top-1/2 block h-[12px] w-[12px] rounded-full transition-[left] duration-180"
        style={{
          left: checked ? 17 : 2,
          transform: 'translateY(-50%)',
          background: checked ? 'var(--accent-ink)' : 'var(--text-faint)',
          transitionTimingFunction: 'var(--ease-spring)',
        }}
      />
    </button>
  )
}

// ── Segmented ───────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label?: ReactNode
  icon?: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  full,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
  full?: boolean
}) {
  return (
    <div
      className={clsx('inline-flex shrink-0 gap-0.5 rounded-md p-[2px]', full && 'w-full')}
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx(
              'focus-ring inline-flex flex-1 items-center justify-center gap-1 rounded-[5px] font-medium transition-colors duration-120',
              // без nowrap длинная подпись переносится и вылезает за кнопку:
              // так ломались «По материалам» в русской версии и «Cutting plan» в английской
              'whitespace-nowrap',
              size === 'xs' ? 'h-[20px] px-1.5 text-[10.5px]' : 'h-[22px] px-2 text-[11.5px]',
            )}
            style={{
              background: on ? 'var(--bg-active)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-faint)',
              boxShadow: on ? 'var(--shadow-sm)' : undefined,
            }}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Badge / Divider / Kbd ───────────────────────────────────────────────────

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok' | 'magnet'
}) {
  const map = {
    neutral: ['var(--text-dim)', 'var(--bg-elevated)'],
    accent: ['var(--accent)', 'color-mix(in oklab, var(--accent) 15%, transparent)'],
    magnet: ['var(--magnet)', 'color-mix(in oklab, var(--magnet) 15%, transparent)'],
    warn: ['var(--warn)', 'color-mix(in oklab, var(--warn) 15%, transparent)'],
    danger: ['var(--danger)', 'color-mix(in oklab, var(--danger) 15%, transparent)'],
    ok: ['var(--ok)', 'color-mix(in oklab, var(--ok) 15%, transparent)'],
  } as const
  const [fg, bg] = map[tone]
  return (
    <span
      className="inline-flex h-[16px] items-center rounded-[4px] px-1.5 text-[10px] font-semibold tracking-wide"
      style={{ color: fg, background: bg }}
    >
      {children}
    </span>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx('h-px w-full shrink-0', className)} style={{ background: 'var(--border-soft)' }} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="num inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[4px] px-1 text-[10px]"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border-strong)',
        borderBottomWidth: 2,
        color: 'var(--text-dim)',
      }}
    >
      {children}
    </kbd>
  )
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

export function Tooltip({
  content,
  children,
  side = 'bottom',
  delay = 380,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [xy, setXy] = useState({ x: 0, y: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild ?? ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 7
      const p =
        side === 'top'
          ? { x: r.left + r.width / 2, y: r.top - gap }
          : side === 'bottom'
            ? { x: r.left + r.width / 2, y: r.bottom + gap }
            : side === 'left'
              ? { x: r.left - gap, y: r.top + r.height / 2 }
              : { x: r.right + gap, y: r.top + r.height / 2 }
      setXy(p)
      setOpen(true)
    }, delay)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  if (!content) return <>{children}</>

  return (
    <>
      <span ref={ref} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide} className="contents">
        {children}
      </span>
      {open &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] anim-in"
            style={{
              left: xy.x,
              top: xy.y,
              transform:
                side === 'top'
                  ? 'translate(-50%,-100%)'
                  : side === 'bottom'
                    ? 'translate(-50%,0)'
                    : side === 'left'
                      ? 'translate(-100%,-50%)'
                      : 'translate(0,-50%)',
            }}
          >
            <div
              className="max-w-[240px] rounded-md px-2 py-1 text-[11.5px] leading-snug"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {content}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

// ── Popover ─────────────────────────────────────────────────────────────────

export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = 'start',
  width,
}: {
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  width?: number
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return setPos(null)
    const r = anchor.current.getBoundingClientRect()
    const w = width ?? 240
    let x = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    const y = Math.min(r.bottom + 5, window.innerHeight - 40)
    setPos({ x, y })
  }, [open, anchor, align, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return
      if (anchor.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={boxRef}
      className="anim-in fixed z-[9000] overflow-hidden rounded-lg"
      style={{
        left: pos.x,
        top: pos.y,
        width: width ?? 240,
        maxHeight: `calc(100vh - ${pos.y + 16}px)`,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

// ── Скроллируемая область с мягкими краями ──────────────────────────────────

export function Scroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>{children}</div>
  )
}
