/**
 * Панель параметров выбранной секции — клиентский вариант.
 *
 * Принцип: покупатель не вводит числа, он ВЫБИРАЕТ из готовых значений.
 * Поэтому все органы управления — крупные чипы-кнопки, а не поля ввода,
 * а язык — «Глубина 500 мм», а не «глубина базы» и уж точно не «профиль 40».
 * Ничего производственного (толщины, кромка, раскрой) здесь нет — это режим 'pro'.
 */

import type { ReactNode } from 'react'

import { RETAIL_MATERIALS, getMaterial } from '@/domain/materials'
import { effBackThickness, outerHeight, outerWidth, retailSpec } from '@/domain/frame'
import { fmtLen } from '@/domain/format'
import { t } from '@/i18n'
import type { FrameSpec, ShelfUnit } from '@/domain/types'
import { useAppStore } from '@/store/useStore'
import { Button, Scroll, Stepper, Toggle, swatchStyle } from '@/ui/controls'

import { ClientCatalog } from './Catalog'
import { ClientSummary, shelfCount } from './Summary'

// ────────────────────────────────────────────────────────────────────────────
//  Стандартные размеры торгового оборудования
// ────────────────────────────────────────────────────────────────────────────

const WIDTHS = [600, 900, 1000, 1250]
const HEIGHTS = [1600, 1800, 2000, 2200]
const DEPTHS = [300, 400, 500, 600]

/** Ниже этого ряд перестаёт быть полкой и становится щелью */
const MIN_ROW = 150

/**
 * Цвета секции. В RETAIL_MATERIALS лежит ещё и пластик ценникодержателя —
 * это не цвет стеллажа, поэтому в свотчи идёт только металл: белый/серый/чёрный.
 */
const COLORS = RETAIL_MATERIALS.filter((m) => m.kind === 'metal')

/**
 * Глубина полок под выбранную глубину секции.
 * Пристенная: полка мельче базы на 100 мм — иначе стеллаж опрокинется вперёд.
 * Островная: глубина делится на две стороны, между ними стенка.
 */
function shelfDepthFor(f: FrameSpec, depth: number): number {
  if (retailSpec(f).island) return Math.max(150, Math.round((depth - effBackThickness(f)) / 2))
  return Math.max(200, depth - 100)
}

/**
 * Ряды под заданное число полок и целевую внешнюю высоту.
 * Считаем честно через outerHeight: сначала «пустая» высота при нулевых рядах
 * (ножки + стойки + посадочные места), потом остаток делим поровну,
 * а погрешность округления добираем верхним рядом.
 */
function rowsFor(f: FrameSpec, n: number, target: number): number[] {
  const zero = outerHeight({ ...f, rows: new Array<number>(n).fill(0) })
  const h = Math.max(MIN_ROW, Math.round((target - zero) / n))
  const rows = new Array<number>(n).fill(h)
  const rest = Math.round(target - outerHeight({ ...f, rows }))
  rows[n - 1] = Math.max(MIN_ROW, rows[n - 1] + rest)
  return rows
}

/**
 * Подбор рядов под выбранную высоту: сначала число рядов при нынешней высоте
 * ряда, потом добор остатка высотой рядов.
 */
function rowsForHeight(f: FrameSpec, target: number): number[] {
  const base = f.rows.length ? f.rows.reduce((s, v) => s + v, 0) / f.rows.length : 400
  let bestN = Math.max(2, f.rows.length)
  let bestD = Infinity
  for (let n = 2; n <= 10; n++) {
    const d = Math.abs(outerHeight({ ...f, rows: new Array<number>(n).fill(base) }) - target)
    if (d < bestD) {
      bestD = d
      bestN = n
    }
  }
  return rowsFor(f, bestN, target)
}

/** Ближайший стандарт из списка — чтобы чип не «слетал» на нестандартном значении */
const nearest = (list: number[], v: number) =>
  list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0])

// ────────────────────────────────────────────────────────────────────────────
//  Мелкие примитивы панели
// ────────────────────────────────────────────────────────────────────────────

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-dim)' }}>
          {label}
        </span>
        {hint && (
          <span className="num shrink-0" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className="focus-ring flex h-[34px] items-center justify-center rounded-md text-[13px] font-medium transition-colors duration-120"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-input)',
        color: active ? 'var(--accent-ink)' : 'var(--text)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
      onPointerEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onPointerLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-input)'
      }}
    >
      {children}
    </button>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex h-[34px] items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-[13px]" style={{ color: 'var(--text)' }}>
          {label}
        </div>
        {hint && (
          <div className="truncate text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
            {hint}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Заглушка для мебельных секций
// ────────────────────────────────────────────────────────────────────────────

function NotRetail({ unit }: { unit: ShelfUnit }) {
  const setUi = useAppStore((s) => s.setUi)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="truncate text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
          {t(unit.name)}
        </div>
        <div
          className="rounded-lg p-3 text-[12.5px] leading-snug"
          style={{
            background: 'var(--bg-panel-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          {t('Эта секция настраивается в режиме менеджера — здесь только торговое оборудование.')}
        </div>
        <Button size="md" full onClick={() => setUi({ audience: 'pro' })}>
          {t('Открыть режим менеджера')}
        </Button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Параметры торговой секции
// ────────────────────────────────────────────────────────────────────────────

function RetailPanel({ unit }: { unit: ShelfUnit }) {
  const updateUnit = useAppStore((s) => s.updateUnit)
  const duplicateUnits = useAppStore((s) => s.duplicateUnits)
  const removeUnits = useAppStore((s) => s.removeUnits)
  const toast = useAppStore((s) => s.toast)

  const f = unit.frame
  const r = retailSpec(f)
  const id = unit.id
  const width = outerWidth(f)
  const height = outerHeight(f)
  const shelves = f.rows.length
  const nearestHeight = nearest(HEIGHTS, height)
  const colorId = unit.materials.carcass

  const edit = (fn: (u: ShelfUnit) => void) => updateUnit(id, fn)

  return (
    <Scroll className="px-4 py-3.5">
      {/* — что настраиваем — */}
      <div className="mb-4">
        <div className="truncate text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
          {t(unit.name)}
        </div>
        <div className="num mt-0.5" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
          {fmtLen(width)} × {fmtLen(height)} × {fmtLen(f.depth)} ·{' '}
          {t('полок {n}', { n: shelfCount(unit) })}
        </div>
      </div>

      <Group label={t('Ширина секции')} hint={fmtLen(width)}>
        <div className="grid grid-cols-4 gap-1.5">
          {WIDTHS.map((v) => (
            <Chip
              key={v}
              active={f.cols.length === 1 && f.cols[0] === v}
              onClick={() =>
                edit((u) => {
                  u.frame.cols = [v]
                })
              }
            >
              {v}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label={t('Высота')} hint={fmtLen(height)}>
        <div className="grid grid-cols-4 gap-1.5">
          {HEIGHTS.map((v) => (
            <Chip
              key={v}
              active={v === nearestHeight && Math.abs(height - v) <= 60}
              onClick={() =>
                edit((u) => {
                  u.frame.rows = rowsForHeight(u.frame, v)
                })
              }
            >
              {v}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label={t('Глубина')} hint={fmtLen(f.depth)}>
        <div className="grid grid-cols-4 gap-1.5">
          {DEPTHS.map((v) => (
            <Chip
              key={v}
              active={f.depth === v}
              title={t('Полки {d} мм', { d: shelfDepthFor(f, v) })}
              onClick={() =>
                edit((u) => {
                  u.frame.depth = v
                  u.frame.retail = {
                    ...(u.frame.retail ?? {}),
                    shelfDepth: shelfDepthFor(u.frame, v),
                  }
                })
              }
            >
              {v}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label={t('Полок')} hint={t('высота {h} сохранится', { h: fmtLen(height) })}>
        <div className="flex h-[34px] items-center">
          <Stepper
            value={Math.min(8, Math.max(3, shelves))}
            min={3}
            max={8}
            onChange={(n) =>
              edit((u) => {
                u.frame.rows = rowsFor(u.frame, n, outerHeight(u.frame))
              })
            }
          />
        </div>
      </Group>

      <Group label={t('Цвет')} hint={t(getMaterial(colorId).name)}>
        <div className="flex gap-2">
          {COLORS.map((m) => {
            const on = m.id === colorId
            return (
              <button
                key={m.id}
                type="button"
                title={t(m.name)}
                aria-label={t(m.name)}
                aria-pressed={on}
                onClick={() =>
                  edit((u) => {
                    u.materials.carcass = m.id
                    u.materials.shelf = m.id
                    u.materials.back = m.id
                    u.materials.front = m.id
                    u.materials.accent = m.id
                  })
                }
                className="focus-ring h-[34px] w-[34px] shrink-0 rounded-md transition-transform duration-120"
                style={{
                  ...swatchStyle(m),
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
                  boxShadow: on ? '0 0 0 2px var(--accent)' : undefined,
                }}
              />
            )
          })}
        </div>
      </Group>

      <div className="mb-4">
        <SwitchRow
          label={t('Ценники')}
          hint={t('держатели по переднему краю полок')}
          checked={r.priceRail}
          onChange={(v) =>
            edit((u) => {
              u.frame.retail = { ...(u.frame.retail ?? {}), priceRail: v }
            })
          }
        />
        <SwitchRow
          label={t('Наклонные полки')}
          hint={t('товар лучше виден покупателю')}
          checked={r.tilt > 0}
          onChange={(v) =>
            edit((u) => {
              u.frame.retail = { ...(u.frame.retail ?? {}), tilt: v ? 10 : 0 }
            })
          }
        />
      </div>

      <div className="flex gap-1.5">
        <Button
          size="md"
          full
          onClick={() => {
            duplicateUnits([id])
            toast(t('Добавлена такая же секция'))
          }}
        >
          {t('Добавить такую же')}
        </Button>
        <Button
          size="md"
          variant="danger"
          onClick={() => {
            removeUnits([id])
            toast(t('Секция удалена'))
          }}
        >
          {t('Удалить')}
        </Button>
      </div>
    </Scroll>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function ClientConfigurator() {
  const unit = useAppStore((s) => s.project.units.find((u) => u.id === s.sel.units[0]))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!unit ? (
        <ClientCatalog />
      ) : unit.frame.style !== 'retail' ? (
        <NotRetail unit={unit} />
      ) : (
        <RetailPanel unit={unit} />
      )}
      <ClientSummary />
    </div>
  )
}
