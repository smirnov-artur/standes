import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import clsx from 'clsx'
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  Info,
  Layers,
  List,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'

import type { BomLine, BomResult, PartRole, ShelfUnit, Warning } from '@/domain/types'
import { computeBom } from '@/domain/bom'
import { materialName } from '@/domain/materials'
import { fmtArea, fmtMass, fmtNum } from '@/domain/format'
import { useAppStore } from '@/store/useStore'
import { INTL_LOCALE, t } from '@/i18n'
import { CURRENCY, money } from '@/i18n/currency'
import { Button, IconButton, Segmented, Swatch, Tooltip, type SegmentedOption } from '@/ui/controls'
import { exportBomCsv } from '@/export/csv'
import { copyToClipboard } from '@/export/share'

// ────────────────────────────────────────────────────────────────────────────
//  Расчёт сметы: один результат на всю панель
//
//  Смету просит и таблица, и шапка нижней панели. Модуль-уровневый кэш на одну
//  запись гарантирует, что при неизменном массиве юнитов считается ровно раз.
// ────────────────────────────────────────────────────────────────────────────

export type BomState = { ok: true; bom: BomResult } | { ok: false; error: string }

let cacheUnits: ShelfUnit[] | null = null
let cacheState: BomState | null = null

export function useBomState(): BomState {
  const units = useAppStore((s) => s.project.units)
  return useMemo<BomState>(() => {
    if (cacheUnits === units && cacheState) return cacheState
    let next: BomState
    try {
      next = { ok: true, bom: computeBom(units.filter((u) => !u.hidden)) }
    } catch (err) {
      next = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    cacheUnits = units
    cacheState = next
    return next
  }, [units])
}

// ────────────────────────────────────────────────────────────────────────────
//  Ширина элемента
//
//  Нижняя панель меняет ширину независимо от окна: боковые панели сворачиваются
//  на месте. Поэтому адаптив строится на ResizeObserver, а не на медиазапросах.
// ────────────────────────────────────────────────────────────────────────────

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      setW((prev) => (prev === next ? prev : next))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, w]
}

// ────────────────────────────────────────────────────────────────────────────
//  Общие заглушки (их же использует CutlistView)
// ────────────────────────────────────────────────────────────────────────────

export function CalcError({ title, error }: { title: string; error: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <TriangleAlert size={18} strokeWidth={1.75} style={{ color: 'var(--danger)' }} />
      <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      <div
        className="num max-w-[560px] leading-snug break-words"
        style={{ color: 'var(--text-faint)', fontSize: 10 }}
      >
        {error}
      </div>
    </div>
  )
}

export function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
        {text}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Стили таблицы
//
//  Заголовки не обрезаются: ширины колонок подобраны под подписи, а под стрелку
//  сортировки всегда зарезервирован слот — появление стрелки ничего не двигает.
// ────────────────────────────────────────────────────────────────────────────

const TABLE_CSS = `
.bom-t { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
.bom-t td, .bom-t th { padding: 0 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bom-t thead th { height: 24px; text-align: left; font-weight: 500; user-select: none; }
.bom-t thead.sticky-head th { position: sticky; top: 0; z-index: 3; }
.bom-t thead th > div { border-bottom: 1px solid var(--border); height: 24px; display: flex; align-items: center; gap: 2px; }
.bom-t thead th.r > div { justify-content: flex-end; }
.bom-t thead th.s { cursor: pointer; }
.bom-t thead th.s:hover .hl { color: var(--text); }
.bom-t th .hl { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 10.5px; font-weight: 500; letter-spacing: 0.01em; color: var(--text-faint); }
.bom-t th .ar { flex: none; width: 11px; height: 11px; display: inline-flex; align-items: center; justify-content: center; }
.bom-t tbody tr { height: 26px; }
.bom-t tbody tr:nth-child(even) > td { background: color-mix(in oklab, var(--text) 3%, transparent); }
.bom-t tbody tr.grp > td { background: var(--bg-panel); border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); cursor: pointer; }
.bom-t tbody tr:hover > td { background: var(--bg-hover); }
.bom-t tbody tr.grp:hover > td { background: var(--bg-hover); }
`

// ────────────────────────────────────────────────────────────────────────────
//  Колонки, приоритеты и сортировка
// ────────────────────────────────────────────────────────────────────────────

type SortKey =
  | 'label'
  | 'materialName'
  | 'dims'
  | 'qty'
  | 'areaTotal'
  | 'massTotal'
  | 'edgeTotal'
  | 'priceEach'
  | 'priceTotal'

interface Sort {
  key: SortKey
  dir: 1 | -1
}

type ColId =
  | 'n'
  | 'label'
  | 'material'
  | 'dims'
  | 'qty'
  | 'area'
  | 'mass'
  | 'edge'
  | 'price'
  | 'total'

interface ColDef {
  id: ColId
  /** подпись в шапке — всегда помещается целиком в ширину колонки */
  title: string
  /** расшифровка сокращения для подсказки */
  hint?: string
  /** 0 — колонка тянется по остатку */
  w: number
  sort: SortKey | null
  right?: boolean
  /**
   * Минимальная ширина панели, при которой колонка показывается.
   * При нехватке места колонка исчезает целиком — заголовки не режем.
   * Порядок исчезновения: кромка → площадь → масса → цена → материал.
   */
  min: number
}

/** Колонка наименования не сжимается ниже этого — иначе строки нечитаемы */
const LABEL_MIN_W = 168

const COLS: ColDef[] = [
  { id: 'n', title: t('№'), w: 34, sort: null, right: true, min: 0 },
  { id: 'label', title: t('Наименование'), w: 0, sort: 'label', min: 0 },
  { id: 'material', title: t('Материал'), w: 90, sort: 'materialName', min: 560 },
  {
    id: 'dims',
    title: t('Размер'),
    hint: t('Размер, мм'),
    w: 92,
    sort: 'dims',
    right: true,
    min: 0,
  },
  { id: 'qty', title: t('Кол.'), hint: t('Количество'), w: 56, sort: 'qty', right: true, min: 0 },
  {
    id: 'area',
    title: t('м²'),
    hint: t('Площадь, м²'),
    w: 68,
    sort: 'areaTotal',
    right: true,
    min: 960,
  },
  {
    id: 'mass',
    title: t('кг'),
    hint: t('Масса, кг'),
    w: 66,
    sort: 'massTotal',
    right: true,
    min: 820,
  },
  {
    id: 'edge',
    title: t('кромка, м'),
    hint: t('Длина кромки, м'),
    w: 86,
    sort: 'edgeTotal',
    right: true,
    min: 1100,
  },
  {
    id: 'price',
    title: t('цена/шт'),
    hint: t('Цена за штуку'),
    w: 80,
    sort: 'priceEach',
    right: true,
    min: 680,
  },
  { id: 'total', title: t('Сумма'), w: 84, sort: 'priceTotal', right: true, min: 0 },
]

/** Колонки, которые в строке группы схлопываются в одну ячейку с названием */
const HEAD_SPAN: ColId[] = ['n', 'label', 'material', 'dims']

const visibleCols = (w: number): ColDef[] => COLS.filter((c) => w >= c.min)

const tableMinWidth = (cols: ColDef[]): number =>
  cols.reduce((s, c) => s + c.w, 0) + LABEL_MIN_W

function cmp(a: BomLine, b: BomLine, key: SortKey): number {
  switch (key) {
    case 'label':
      return a.label.localeCompare(b.label, INTL_LOCALE)
    case 'materialName':
      return materialName(a.materialId).localeCompare(materialName(b.materialId), INTL_LOCALE)
    case 'dims':
      return a.dims.localeCompare(b.dims, INTL_LOCALE, { numeric: true })
    default:
      return a[key] - b[key]
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Группировка
// ────────────────────────────────────────────────────────────────────────────

type GroupMode = 'flat' | 'material' | 'role'

const GROUP_OPTS: { value: GroupMode; label: string; icon: ReactNode; title: string }[] = [
  {
    value: 'flat',
    label: t('Список'),
    icon: <List size={12} strokeWidth={1.75} />,
    title: t('Плоский список позиций'),
  },
  {
    value: 'material',
    label: t('Материалы'),
    icon: <Layers size={12} strokeWidth={1.75} />,
    title: t('Группировать по материалам'),
  },
  {
    value: 'role',
    label: t('Роли'),
    icon: <Boxes size={12} strokeWidth={1.75} />,
    title: t('Группировать по назначению деталей'),
  },
]

const ROLE_TITLE: Record<PartRole, string> = {
  side: t('Боковины'),
  top: t('Крышки'),
  bottom: t('Дно'),
  divider: t('Перегородки'),
  shelf: t('Полки'),
  'sub-shelf': t('Полки дополнительные'),
  'sub-divider': t('Подперегородки'),
  back: t('Задние стенки'),
  plinth: t('Цоколь'),
  door: t('Двери'),
  'drawer-front': t('Фасады ящиков'),
  'drawer-side': t('Царги ящиков'),
  'drawer-bottom': t('Дно ящиков'),
  rod: t('Штанги'),
  foot: t('Опоры'),
  handle: t('Ручки'),
  post: t('Стойки'),
  rail: t('Ригели'),
  brace: t('Связи жёсткости'),
  box: t('Короба'),
  upright: t('Стойки перфорированные'),
  bracket: t('Кронштейны полок'),
  lip: t('Отбортовки полок'),
  'price-rail': t('Ценникодержатели'),
  'base-front': t('Фронты базы'),
  header: t('Карнизы'),
}

interface Grp {
  id: string
  title: string
  materialId?: string
  lines: BomLine[]
  qty: number
  area: number
  mass: number
  edge: number
  price: number
}

function groupLines(lines: BomLine[], mode: GroupMode): Grp[] {
  const map = new Map<string, Grp>()
  for (const l of lines) {
    const id = mode === 'material' ? `m:${l.materialId}` : `r:${l.role}`
    let g = map.get(id)
    if (!g) {
      g = {
        id,
        title: mode === 'material' ? materialName(l.materialId) : (ROLE_TITLE[l.role] ?? l.role),
        materialId: mode === 'material' ? l.materialId : undefined,
        lines: [],
        qty: 0,
        area: 0,
        mass: 0,
        edge: 0,
        price: 0,
      }
      map.set(id, g)
    }
    g.lines.push(l)
    g.qty += l.qty
    g.area += l.areaTotal
    g.mass += l.massTotal
    g.edge += l.edgeTotal
    g.price += l.priceTotal
  }
  return [...map.values()].sort(
    (a, b) => b.price - a.price || a.title.localeCompare(b.title, INTL_LOCALE),
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Форматирование ячеек
// ────────────────────────────────────────────────────────────────────────────

const DASH = '—'
const area = (v: number) => (v > 0 ? fmtArea(v) : DASH)
const mass = (v: number) => (v > 0 ? fmtMass(v) : DASH)
const edge = (v: number) => (v > 0 ? `${fmtNum(v, 2)}${' '}${t('м')}` : DASH)
const cash = (v: number) => (v > 0 ? money(v) : DASH)

/** Буфер обмена: TSV вставляется в Excel/Sheets как готовая таблица */
function buildTsv(bom: BomResult): string {
  // десятичный разделитель — тот, которого ждёт локальная таблица;
  // разряды не отбиваем: Excel принял бы пробел за разделитель колонок
  const n = (v: number, d: number) => fmtNum(v, d, '')
  /** цена уходит в таблицу числом — смета уже посчитана в валюте сборки */
  const cur = (v: number, d: number) => n(v, d)
  const rows: string[][] = []
  rows.push([
    t('№'),
    t('Наименование'),
    t('Материал'),
    t('Размер, мм'),
    t('Кол-во'),
    t('Площадь, м²'),
    t('Масса, кг'),
    t('Кромка, м'),
    t('Цена, {cur}', { cur: CURRENCY.symbol }),
    t('Сумма, {cur}', { cur: CURRENCY.symbol }),
  ])
  bom.lines.forEach((l, i) =>
    rows.push([
      String(i + 1),
      l.label,
      materialName(l.materialId),
      l.dims,
      String(l.qty),
      n(l.areaTotal, 3),
      n(l.massTotal, 2),
      n(l.edgeTotal, 2),
      cur(l.priceEach, 0),
      cur(l.priceTotal, 0),
    ]),
  )
  if (bom.hardware.length) {
    rows.push([])
    rows.push([t('Фурнитура')])
    bom.hardware.forEach((h, i) =>
      rows.push([
        String(i + 1),
        h.label,
        '',
        '',
        String(h.qty),
        '',
        '',
        '',
        cur(h.priceEach, 0),
        cur(h.priceTotal, 0),
      ]),
    )
  }
  rows.push([])
  rows.push([t('Материалы'), '', '', '', '', '', '', '', '', cur(bom.totals.materialsPrice, 0)])
  rows.push([t('Кромление'), '', '', '', '', '', '', '', '', cur(bom.totals.edgePrice, 0)])
  rows.push([t('Фурнитура'), '', '', '', '', '', '', '', '', cur(bom.totals.hardwarePrice, 0)])
  rows.push([t('ИТОГО'), '', '', '', '', '', '', '', '', cur(bom.totals.price, 0)])
  return rows.map((r) => r.join('\t')).join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
//  Предупреждения
// ────────────────────────────────────────────────────────────────────────────

function warnTone(list: Warning[]): { color: string; icon: typeof Info } {
  if (list.some((w) => w.level === 'error')) return { color: 'var(--danger)', icon: CircleAlert }
  if (list.some((w) => w.level === 'warn')) return { color: 'var(--warn)', icon: TriangleAlert }
  return { color: 'var(--text-dim)', icon: Info }
}

function Warnings({ list }: { list: Warning[] }) {
  const [open, setOpen] = useState(false)
  if (!list.length) return null
  const { color, icon: Icon } = warnTone(list)
  return (
    <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex h-[24px] w-full items-center gap-1.5 px-2.5 text-left transition-colors"
        style={{ background: `color-mix(in oklab, ${color} 8%, transparent)` }}
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className="shrink-0 transition-transform duration-150"
          style={{ color, transform: open ? 'rotate(90deg)' : 'none' }}
        />
        <Icon size={13} strokeWidth={1.75} style={{ color }} className="shrink-0" />
        <span className="shrink-0 text-[11.5px]" style={{ color }}>
          {t('Замечаний:')} <span className="num">{list.length}</span>
        </span>
        {!open && (
          <span
            className="min-w-0 flex-1 truncate text-[11.5px]"
            style={{ color: 'var(--text-faint)' }}
          >
            {list[0].message}
          </span>
        )}
      </button>
      {open && (
        <div className="max-h-[96px] overflow-y-auto px-2.5 py-1">
          {list.map((w, i) => (
            <div key={`${w.code}:${i}`} className="flex items-start gap-1.5 py-[2px]">
              <span
                className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{
                  background:
                    w.level === 'error'
                      ? 'var(--danger)'
                      : w.level === 'warn'
                        ? 'var(--warn)'
                        : 'var(--text-faint)',
                }}
              />
              <span className="text-[11.5px] leading-tight" style={{ color: 'var(--text-dim)' }}>
                {w.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Таблица
// ────────────────────────────────────────────────────────────────────────────

function ColGroup({ cols }: { cols: ColDef[] }) {
  return (
    <colgroup>
      {cols.map((c) => (
        <col key={c.id} style={c.w ? { width: c.w } : undefined} />
      ))}
    </colgroup>
  )
}

function Head({
  cols,
  sort,
  onSort,
}: {
  cols: ColDef[]
  sort: Sort | null
  onSort: (k: SortKey) => void
}) {
  const Arrow = sort?.dir === -1 ? ArrowDown : ArrowUp
  return (
    <thead className="sticky-head" style={{ background: 'var(--bg-panel-2)' }}>
      <tr>
        {cols.map((c) => {
          const key = c.sort
          const on = !!sort && key === sort.key
          // слот под стрелку зарезервирован всегда — сортировка не двигает подпись
          const arrow = key ? (
            <span className="ar">
              {on && <Arrow size={10} strokeWidth={2.25} style={{ color: 'var(--accent)' }} />}
            </span>
          ) : null
          return (
            <th
              key={c.id}
              className={clsx(c.right && 'r', key && 's')}
              style={{ background: 'var(--bg-panel-2)' }}
              onClick={key ? () => onSort(key) : undefined}
              title={
                key
                  ? c.hint
                    ? `${c.hint} · ${t('сортировать')}`
                    : t('Сортировать')
                  : undefined
              }
            >
              <div>
                {c.right && arrow}
                <span className="hl" style={on ? { color: 'var(--text)' } : undefined}>
                  {c.title}
                </span>
                {!c.right && arrow}
              </div>
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

/** Ячейка строки спецификации: содержимое зависит только от id колонки */
function lineCell(c: ColDef, l: BomLine, n: number, withMaterialCol: boolean): ReactNode {
  switch (c.id) {
    case 'n':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-faint)' }}>
          {n}
        </td>
      )
    case 'label':
      return (
        <td
          key={c.id}
          className="text-[12px]"
          style={{ color: 'var(--text)' }}
          title={withMaterialCol ? l.label : `${l.label} · ${materialName(l.materialId)}`}
        >
          <span className="flex items-center gap-1.5">
            <Swatch materialId={l.materialId} size={12} round={3} />
            <span className="truncate">{l.label}</span>
          </span>
        </td>
      )
    case 'material':
      return (
        <td
          key={c.id}
          className="text-[11.5px]"
          style={{ color: 'var(--text-dim)' }}
          title={materialName(l.materialId)}
        >
          {materialName(l.materialId)}
        </td>
      )
    case 'dims':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
          {l.dims}
        </td>
      )
    case 'qty':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text)' }}>
          {l.qty}
        </td>
      )
    case 'area':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
          {area(l.areaTotal)}
        </td>
      )
    case 'mass':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
          {mass(l.massTotal)}
        </td>
      )
    case 'edge':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
          {edge(l.edgeTotal)}
        </td>
      )
    case 'price':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text-faint)' }}>
          {cash(l.priceEach)}
        </td>
      )
    case 'total':
      return (
        <td key={c.id} className="num text-right" style={{ color: 'var(--text)' }}>
          {cash(l.priceTotal)}
        </td>
      )
  }
}

function LineRow({ cols, n, l }: { cols: ColDef[]; n: number; l: BomLine }) {
  const withMaterialCol = cols.some((c) => c.id === 'material')
  return <tr>{cols.map((c) => lineCell(c, l, n, withMaterialCol))}</tr>
}

function GroupRow({
  cols,
  g,
  open,
  onToggle,
}: {
  cols: ColDef[]
  g: Grp
  open: boolean
  onToggle: () => void
}) {
  const span = cols.filter((c) => HEAD_SPAN.includes(c.id)).length
  const rest = cols.filter((c) => !HEAD_SPAN.includes(c.id))
  return (
    <tr className="grp" onClick={onToggle}>
      <td colSpan={span}>
        <span className="flex items-center gap-1.5">
          <ChevronRight
            size={12}
            strokeWidth={1.75}
            className="shrink-0 transition-transform duration-150"
            style={{ color: 'var(--text-faint)', transform: open ? 'rotate(90deg)' : 'none' }}
          />
          {g.materialId && <Swatch materialId={g.materialId} size={13} round={3} />}
          <span className="truncate text-[12px] font-medium" style={{ color: 'var(--text)' }}>
            {g.title}
          </span>
          <span className="num shrink-0" style={{ color: 'var(--text-faint)' }}>
            {t('{n} поз.', { n: g.lines.length })}
          </span>
        </span>
      </td>
      {rest.map((c) => {
        switch (c.id) {
          case 'qty':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text)' }}>
                {g.qty}
              </td>
            )
          case 'area':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
                {area(g.area)}
              </td>
            )
          case 'mass':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
                {mass(g.mass)}
              </td>
            )
          case 'edge':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
                {edge(g.edge)}
              </td>
            )
          case 'total':
            return (
              <td
                key={c.id}
                className="num text-right font-medium"
                style={{ color: 'var(--accent)' }}
              >
                {cash(g.price)}
              </td>
            )
          default:
            return <td key={c.id} />
        }
      })}
    </tr>
  )
}

function HardwareRow({
  cols,
  n,
  label,
  qty,
  massKg,
  priceEach,
  priceTotal,
}: {
  cols: ColDef[]
  n: number
  label: string
  qty: number
  massKg: number
  priceEach: number
  priceTotal: number
}) {
  return (
    <tr>
      {cols.map((c) => {
        switch (c.id) {
          case 'n':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-faint)' }}>
                {n}
              </td>
            )
          case 'label':
            return (
              <td key={c.id} className="text-[12px]" style={{ color: 'var(--text)' }} title={label}>
                {label}
              </td>
            )
          case 'qty':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text)' }}>
                {qty}
              </td>
            )
          case 'mass':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-dim)' }}>
                {mass(massKg)}
              </td>
            )
          case 'price':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-faint)' }}>
                {cash(priceEach)}
              </td>
            )
          case 'total':
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text)' }}>
                {cash(priceTotal)}
              </td>
            )
          default:
            return (
              <td key={c.id} className="num text-right" style={{ color: 'var(--text-faint)' }}>
                {DASH}
              </td>
            )
        }
      })}
    </tr>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function BomTable() {
  const state = useBomState()
  const toast = useAppStore((s) => s.toast)
  const [mode, setMode] = useState<GroupMode>('flat')
  const [sort, setSort] = useState<Sort | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [rootRef, width] = useElementWidth<HTMLDivElement>()

  const bom = state.ok ? state.bom : null

  const lines = useMemo(() => {
    const src = bom?.lines ?? []
    if (!sort) return src
    return [...src].sort((a, b) => cmp(a, b, sort.key) * sort.dir)
  }, [bom, sort])

  const groups = useMemo(() => (mode === 'flat' ? [] : groupLines(lines, mode)), [lines, mode])

  const cols = useMemo(() => visibleCols(width), [width])
  const minWidth = useMemo(() => tableMinWidth(cols), [cols])

  // порядок сжатия панели инструментов:
  // подпись сброса → подписи режима → счётчик → подписи кнопок
  const resetCompact = width > 0 && width < 780
  const segCompact = width > 0 && width < 600
  const showCount = width >= 470
  const btnCompact = width > 0 && width < 400
  const sumsCompact = width > 0 && width < 560

  const segOptions = useMemo<SegmentedOption<GroupMode>[]>(
    () =>
      GROUP_OPTS.map((o) =>
        segCompact
          ? {
              value: o.value,
              icon: (
                <Tooltip content={o.title} delay={220}>
                  <span className="inline-flex">{o.icon}</span>
                </Tooltip>
              ),
            }
          : { value: o.value, label: o.label, icon: o.icon, title: o.title },
      ),
    [segCompact],
  )

  const onSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))

  const doCsv = () => {
    if (!bom) return
    try {
      exportBomCsv(bom, useAppStore.getState().project)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Экспорт не удался'), 'error')
    }
  }

  const doCopy = () => {
    if (!bom) return
    void copyToClipboard(buildTsv(bom)).then((ok) =>
      toast(
        ok ? t('Спецификация скопирована') : t('Не удалось скопировать'),
        ok ? 'info' : 'error',
      ),
    )
  }

  if (!state.ok) {
    return (
      <div ref={rootRef} className="flex h-full min-h-0 flex-col">
        <CalcError title={t('Не удалось рассчитать спецификацию')} error={state.error} />
      </div>
    )
  }

  const b = state.bom
  const tot = b.totals

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <style>{TABLE_CSS}</style>

      {/* ── панель инструментов ── */}
      <div
        className="flex h-[32px] shrink-0 items-center gap-2 overflow-hidden px-2.5"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        <Segmented value={mode} onChange={setMode} options={segOptions} />
        {sort &&
          (resetCompact ? (
            <IconButton
              label={t('Сбросить сортировку')}
              size="xs"
              variant="quiet"
              onClick={() => setSort(null)}
            >
              <RotateCcw size={12} strokeWidth={1.75} />
            </IconButton>
          ) : (
            <Button size="xs" variant="quiet" onClick={() => setSort(null)}>
              {t('Сбросить сортировку')}
            </Button>
          ))}
        <div className="min-w-0 flex-1" />
        {showCount && (
          <span className="num shrink-0 whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
            {t('{n} позиций', { n: b.lines.length })}
          </span>
        )}
        {btnCompact ? (
          <>
            <IconButton label={t('Копировать')} size="xs" onClick={doCopy}>
              <Copy size={13} strokeWidth={1.75} />
            </IconButton>
            <IconButton label={t('Экспорт CSV')} size="xs" onClick={doCsv}>
              <Download size={13} strokeWidth={1.75} />
            </IconButton>
          </>
        ) : (
          <>
            <Button size="xs" icon={<Copy size={13} strokeWidth={1.75} />} onClick={doCopy}>
              {t('Копировать')}
            </Button>
            <Button size="xs" icon={<Download size={13} strokeWidth={1.75} />} onClick={doCsv}>
              {t('Экспорт CSV')}
            </Button>
          </>
        )}
      </div>

      <Warnings list={b.warnings} />

      {/* ── тело ── */}
      {b.lines.length === 0 ? (
        <div className="min-h-0 flex-1">
          <EmptyNote text={t('Нет деталей. Добавьте стеллаж — спецификация соберётся сама.')} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="bom-t" style={{ minWidth }}>
            <ColGroup cols={cols} />
            <Head cols={cols} sort={sort} onSort={onSort} />
            <tbody>
              {mode === 'flat'
                ? lines.map((l, i) => <LineRow key={l.key} cols={cols} n={i + 1} l={l} />)
                : groups.flatMap((g) => {
                    const isOpen = !!open[g.id]
                    const rows = [
                      <GroupRow
                        key={g.id}
                        cols={cols}
                        g={g}
                        open={isOpen}
                        onToggle={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
                      />,
                    ]
                    if (isOpen) {
                      g.lines.forEach((l, i) =>
                        rows.push(
                          <LineRow key={`${g.id}/${l.key}`} cols={cols} n={i + 1} l={l} />,
                        ),
                      )
                    }
                    return rows
                  })}
            </tbody>
          </table>

          {/* ── фурнитура ── */}
          {b.hardware.length > 0 && (
            <>
              <div
                className="flex h-[26px] items-center gap-2 px-2.5"
                style={{
                  borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border-soft)',
                  background: 'var(--bg-panel)',
                }}
              >
                <span className="label">{t('Фурнитура')}</span>
                <span className="num" style={{ color: 'var(--text-faint)' }}>
                  {t('{n} поз.', { n: b.hardware.length })}
                </span>
                <div className="flex-1" />
                <span className="num" style={{ color: 'var(--text)' }}>
                  {money(tot.hardwarePrice)}
                </span>
              </div>
              <table className="bom-t" style={{ minWidth }}>
                <ColGroup cols={cols} />
                <tbody>
                  {b.hardware.map((h, i) => (
                    <HardwareRow
                      key={h.key}
                      cols={cols}
                      n={i + 1}
                      label={h.label}
                      qty={h.qty}
                      massKg={h.qty * h.massEach}
                      priceEach={h.priceEach}
                      priceTotal={h.priceTotal}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ── подвал: высота совпадает с шапкой панели и с подвалом раскроя ── */}
      <div
        className="flex h-[34px] shrink-0 items-center gap-3 px-2.5"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}
      >
        {!sumsCompact && (
          <>
            <Sum label={t('Материалы')} value={money(tot.materialsPrice)} />
            <Sum label={t('Кромление')} value={money(tot.edgePrice)} />
            <Sum label={t('Фурнитура')} value={money(tot.hardwarePrice)} />
          </>
        )}
        <div className="min-w-0 flex-1" />
        <Tooltip
          content={
            sumsCompact ? (
              <div className="flex flex-col gap-0.5">
                <TipRow label={t('Материалы')} value={money(tot.materialsPrice)} />
                <TipRow label={t('Кромление')} value={money(tot.edgePrice)} />
                <TipRow label={t('Фурнитура')} value={money(tot.hardwarePrice)} />
              </div>
            ) : null
          }
          side="top"
          delay={220}
        >
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="label">{t('Итого')}</span>
            <span
              className="num"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.01em',
              }}
            >
              {money(tot.price)}
            </span>
          </span>
        </Tooltip>
      </div>
    </div>
  )
}

function Sum({ label, value }: { label: string; value: string }) {
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

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <span className="num" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </span>
  )
}
