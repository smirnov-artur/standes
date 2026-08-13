import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Scissors, Table2, X } from 'lucide-react'

import { fmtArea, fmtMass } from '@/domain/format'
import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import { IconButton, Segmented, Tooltip, type SegmentedOption } from '@/ui/controls'
import { BomTable, useBomState, useElementWidth } from '@/ui/BomTable'
import { CutlistView } from '@/ui/CutlistView'
import { LS_NS } from '@/export/project'

// ────────────────────────────────────────────────────────────────────────────
//  Высота панели: тянется за верхний край, живёт в localStorage
// ────────────────────────────────────────────────────────────────────────────

/** Ключ версионирован: прежние 260 px оказались слишком низкими для сметы */
const STORE_KEY = `${LS_NS}:bottomH2`
const MIN_H = 140
const DEFAULT_H = 320
/** Полоса сцены, которую панель не имеет права съесть */
const MIN_VIEWPORT_H = 120

/**
 * Верхний предел высоты. `avail` — высота колонки со сценой (0, если ещё не
 * измерена): вычитая из неё запас на сцену, гарантируем, что нижний край
 * панели не уедет под строку состояния.
 */
function maxH(avail: number): number {
  const byWindow = Math.round(window.innerHeight * 0.7)
  const byColumn = avail > 0 ? Math.round(avail - MIN_VIEWPORT_H) : byWindow
  return Math.max(MIN_H, Math.min(byWindow, byColumn))
}

const clampH = (v: number, avail: number) => Math.max(MIN_H, Math.min(maxH(avail), Math.round(v)))

function readH(): number {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    const v = raw === null ? NaN : Number.parseInt(raw, 10)
    return Number.isFinite(v) ? clampH(v, 0) : DEFAULT_H
  } catch {
    return DEFAULT_H
  }
}

// ────────────────────────────────────────────────────────────────────────────

export function BottomPanel() {
  const bottom = useAppStore((s) => s.ui.bottom)
  const setUi = useAppStore((s) => s.setUi)

  const [h, setH] = useState(readH)
  const [resizing, setResizing] = useState(false)
  const hRef = useRef(h)
  hRef.current = h

  const secRef = useRef<HTMLElement | null>(null)
  /** высота родительской колонки — известна только после измерения */
  const availRef = useRef(0)

  const [headRef, headW] = useElementWidth<HTMLElement>()

  // сохраняем с задержкой — во время тяги не пишем на каждый кадр
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(STORE_KEY, String(h))
      } catch {
        /* приватный режим — не беда */
      }
    }, 250)
    return () => clearTimeout(t)
  }, [h])

  // колонка со сценой изменилась (окно, боковые панели) — пережимаем высоту.
  // Высота родителя от высоты панели не зависит, обратной связи нет.
  useLayoutEffect(() => {
    const parent = secRef.current?.parentElement
    if (!parent) return
    const read = () => {
      const next = parent.getBoundingClientRect().height
      if (Math.abs(next - availRef.current) < 0.5) return
      availRef.current = next
      setH((v) => clampH(v, next))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  // подстраховка на случай, если родителя измерить не удалось
  useEffect(() => {
    const onResize = () => setH((v) => clampH(v, availRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startResize = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const y0 = e.clientY
    const h0 = hRef.current
    const move = (ev: PointerEvent) => setH(clampH(h0 - (ev.clientY - y0), availRef.current))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    setResizing(true)
  }, [])

  const onGripKey = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 12
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setH((v) => clampH(v + step, availRef.current))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setH((v) => clampH(v - step, availRef.current))
    }
  }, [])

  // при нехватке ширины вкладки схлопываются в иконки, итоги — в одну «Сумму»
  const tabsCompact = headW > 0 && headW < 400
  const totalsCompact = headW > 0 && headW < 640

  const tabs = useMemo<SegmentedOption<'bom' | 'cutlist'>[]>(() => {
    const src = [
      {
        value: 'bom' as const,
        label: t('Спецификация'),
        icon: <Table2 size={13} strokeWidth={1.75} />,
        title: t('Смета: детали, фурнитура, стоимость'),
      },
      {
        value: 'cutlist' as const,
        label: t('Раскрой'),
        icon: <Scissors size={13} strokeWidth={1.75} />,
        title: t('Карта раскроя листов'),
      },
    ]
    return src.map((o) =>
      tabsCompact
        ? {
            value: o.value,
            icon: (
              <Tooltip content={o.title} delay={220}>
                <span className="inline-flex">{o.icon}</span>
              </Tooltip>
            ),
          }
        : o,
    )
  }, [tabsCompact])

  if (bottom === 'none') return null

  return (
    <section
      ref={secRef}
      className="relative flex shrink-0 flex-col"
      style={{
        height: h,
        background: 'var(--bg-panel-2)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* ── ручка изменения высоты ── */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('Высота нижней панели')}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={onGripKey}
        className="group focus-ring absolute inset-x-0 -top-[3px] z-10 flex h-[7px] cursor-ns-resize items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <span
          className="h-[3px] w-[34px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{
            background: resizing ? 'var(--accent)' : 'var(--border-strong)',
            opacity: resizing ? 1 : undefined,
            transitionTimingFunction: 'var(--ease-out-expo)',
          }}
        />
      </div>

      {/* ── шапка ── */}
      <header
        ref={headRef}
        className="flex h-[34px] shrink-0 items-center gap-2 px-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Segmented value={bottom} onChange={(v) => setUi({ bottom: v })} options={tabs} />
        <div className="min-w-0 flex-1" />
        <Totals compact={totalsCompact} />
        <IconButton
          label={t('Закрыть панель')}
          size="xs"
          variant="quiet"
          onClick={() => setUi({ bottom: 'none' })}
        >
          <X size={14} strokeWidth={1.75} />
        </IconButton>
      </header>

      {/* ── содержимое ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {bottom === 'bom' ? <BomTable /> : <CutlistView />}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Сводка в шапке — одна и та же на обеих вкладках, чтобы цифра «сколько это
//  стоит» была на виду всегда. В узкой панели остаётся только сумма,
//  остальное уходит в подсказку.
// ────────────────────────────────────────────────────────────────────────────

function Totals({ compact }: { compact: boolean }) {
  const state = useBomState()
  if (!state.ok) {
    return (
      <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--danger)' }}>
        {t('Ошибка расчёта')}
      </span>
    )
  }
  const tot = state.bom.totals
  const rows: [string, string][] = [
    [t('Деталей'), String(tot.parts)],
    [t('Площадь'), fmtArea(tot.area)],
    [t('Масса'), fmtMass(tot.mass)],
  ]
  return (
    <div className="flex shrink-0 items-center gap-3">
      {!compact && rows.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
      <Tooltip
        content={
          compact ? (
            <div className="flex flex-col gap-0.5">
              {rows.map(([label, value]) => (
                <span key={label} className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {label}
                  </span>
                  <span className="num" style={{ color: 'var(--text)' }}>
                    {value}
                  </span>
                </span>
              ))}
            </div>
          ) : null
        }
        side="bottom"
        delay={220}
      >
        <span
          className="num shrink-0 whitespace-nowrap"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.01em' }}
        >
          {money(tot.price)}
        </span>
      </Tooltip>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <span className="num whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
        {value}
      </span>
    </span>
  )
}
