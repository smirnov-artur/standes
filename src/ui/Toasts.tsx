/**
 * Всплывающие уведомления.
 *
 * Стор хранит только ПОСЛЕДНИЙ тост (`ui.toast`), очередь живёт здесь:
 * новый тост добавляется по `id`, показываются максимум три, у каждого —
 * собственный таймер (он не сбрасывается приходом следующего тоста).
 * Клик закрывает досрочно.
 */

import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { t as tr } from '@/i18n'
import { useAppStore } from '@/store/useStore'

type ToastKind = 'info' | 'warn' | 'error'

interface ToastItem {
  id: string
  text: string
  kind: ToastKind
}

const MAX_VISIBLE = 3
const TTL: Record<ToastKind, number> = { info: 3200, warn: 3200, error: 5500 }

const ICON: Record<ToastKind, ReactNode> = {
  info: <Info size={14} strokeWidth={1.75} />,
  warn: <TriangleAlert size={14} strokeWidth={1.75} />,
  error: <CircleAlert size={14} strokeWidth={1.75} />,
}

const TONE: Record<ToastKind, string> = {
  info: 'var(--text-dim)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
}

export function Toasts() {
  const toast = useAppStore((s) => s.ui.toast)
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    setItems((prev) => (prev.some((x) => x.id === id) ? prev.filter((x) => x.id !== id) : prev))
  }, [])

  // таймеры переживают приход новых тостов и гасятся только при размонтировании
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach(clearTimeout)
      map.clear()
    }
  }, [])

  useEffect(() => {
    if (!toast || timers.current.has(toast.id)) return
    const item: ToastItem = { id: toast.id, text: toast.text, kind: toast.kind }
    setItems((prev) =>
      prev.some((x) => x.id === item.id) ? prev : [...prev, item].slice(-MAX_VISIBLE),
    )
    timers.current.set(
      item.id,
      setTimeout(() => dismiss(item.id), TTL[item.kind]),
    )
  }, [toast, dismiss])

  if (!items.length) return null

  return (
    <div
      className="pointer-events-none fixed bottom-[30px] left-1/2 z-[8000] flex -translate-x-1/2 flex-col items-stretch gap-1.5"
      style={{ width: 'min(440px, calc(100vw - 32px))' }}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          title={tr('Закрыть')}
          className="anim-in pointer-events-auto relative flex items-center gap-2 overflow-hidden rounded-md py-[7px] pr-3 pl-3 text-left text-[12px] leading-snug transition-transform duration-150 active:scale-[0.99]"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-lg)',
            color: 'var(--text)',
            transitionTimingFunction: 'var(--ease-out-expo)',
          }}
        >
          <span
            aria-hidden
            className="absolute top-0 bottom-0 left-0 w-[2.5px]"
            style={{ background: TONE[t.kind] }}
          />
          <span className="shrink-0" style={{ color: TONE[t.kind] }}>
            {ICON[t.kind]}
          </span>
          <span className="min-w-0 flex-1">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
