/**
 * Итог заказа глазами покупателя.
 *
 * Здесь намеренно нет ни массы, ни площади, ни кромки, ни фурнитуры —
 * всё это живёт в режиме менеджера. Клиенту нужны три числа: сколько секций,
 * какой длины получилась линия и сколько это стоит.
 */

import { useMemo } from 'react'

import { computeBom } from '@/domain/bom'
import { outerWidth } from '@/domain/frame'
import { fmtLen } from '@/domain/format'
import { plural, t } from '@/i18n'
import { money } from '@/i18n/currency'
import type { ShelfUnit } from '@/domain/types'
import { useAppStore } from '@/store/useStore'
import { Button } from '@/ui/controls'

// ────────────────────────────────────────────────────────────────────────────
//  Сводка — общая для панели, шапки и формы заявки
// ────────────────────────────────────────────────────────────────────────────

export interface OrderSummary {
  /** видимые секции — скрытые в заказ не идут */
  units: ShelfUnit[]
  sections: number
  /** суммарная длина по фронту, мм */
  totalWidth: number
  /** сколько полок во всём заказе */
  shelves: number
  price: number
}

/** Полок в секции: по одной на каждый ряд каждой колонки */
export function shelfCount(u: ShelfUnit): number {
  return u.frame.rows.length * Math.max(1, u.frame.cols.length)
}

/**
 * Одна точка правды по заказу. Смета считается лениво и мемоизируется по
 * ссылке на массив юнитов: immer меняет её только при реальной правке проекта,
 * поэтому лишних пересчётов при наведении/выборе не будет.
 */
export function useOrderSummary(): OrderSummary {
  const units = useAppStore((s) => s.project.units)

  return useMemo<OrderSummary>(() => {
    const visible = units.filter((u) => !u.hidden)
    return {
      units: visible,
      sections: visible.length,
      totalWidth: visible.reduce((sum, u) => sum + outerWidth(u.frame), 0),
      shelves: visible.reduce((sum, u) => sum + shelfCount(u), 0),
      price: visible.length ? computeBom(visible).totals.price : 0,
    }
  }, [units])
}

// ────────────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[26px] items-center justify-between gap-3">
      <span className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      <span className="num shrink-0" style={{ fontSize: 12.5, color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

export function ClientSummary() {
  const { sections, totalWidth, shelves, price } = useOrderSummary()
  const setUi = useAppStore((s) => s.setUi)

  return (
    <div
      className="flex shrink-0 flex-col gap-1 px-4 pt-3 pb-4"
      style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel-2)' }}
    >
      <Row label={plural(sections, 'Секция', 'Секции', 'Секций')} value={String(sections)} />
      <Row label={t('Общая длина')} value={fmtLen(totalWidth)} />
      <Row label={t('Полок всего')} value={String(shelves)} />

      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
          {t('Итого')}
        </span>
        <span
          className="num shrink-0"
          style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}
        >
          {money(price)}
        </span>
      </div>

      <div className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
        {t('Цена ориентировочная, окончательную подтвердит менеджер')}
      </div>

      <Button
        full
        size="md"
        variant="primary"
        className="mt-2.5"
        disabled={sections === 0}
        onClick={() => setUi({ lead: true })}
      >
        {t('Оставить заявку')}
      </Button>
    </div>
  )
}
