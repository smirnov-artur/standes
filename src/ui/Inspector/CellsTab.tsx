import { useLayoutEffect, useRef, useState } from 'react'
import {
  Archive,
  Columns3,
  DoorClosed,
  Eraser,
  FlipHorizontal,
  Package,
  PaintBucket,
  RotateCcw,
  Rows3,
  Shirt,
  Square,
  SquareDashedBottom,
  Ungroup,
  type LucideIcon,
} from 'lucide-react'

import type {
  Cell,
  CellFill,
  CellFillKind,
  CellKey,
  CellRect,
  DoorHinge,
  DoorStyle,
  DrawerFront,
  ShelfUnit,
} from '@/domain/types'
import { cellKey, parseCellKey } from '@/domain/types'
import { cellRects, effFootHeight, nCols, nRows, outerHeight, outerWidth } from '@/domain/frame'
import {
  clearAllCells,
  fillAllCells,
  mergeCells,
  mirrorCells,
  patchCell,
  setCellFill,
  splitCell,
} from '@/domain/edit'
import { STRUCTURAL_MATERIALS } from '@/domain/materials'
import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import {
  Button,
  Field,
  IconButton,
  MaterialPicker,
  Section,
  Segmented,
  Stepper,
  Toggle,
  Tooltip,
} from '@/ui/controls'

import { useUpdate } from './index'

const SW = 1.75
const MAP_H = 196

// ── типы заполнения ─────────────────────────────────────────────────────────

const TYPES: { t: CellFillKind; label: string; Icon: LucideIcon }[] = [
  { t: 'empty', label: t('Пусто'), Icon: Square },
  { t: 'shelves', label: t('Полки'), Icon: Rows3 },
  { t: 'drawers', label: t('Ящики'), Icon: Archive },
  { t: 'door', label: t('Дверь'), Icon: DoorClosed },
  { t: 'dividers', label: t('Перегородки'), Icon: Columns3 },
  { t: 'rod', label: t('Штанга'), Icon: Shirt },
  { t: 'panel', label: t('Панель'), Icon: SquareDashedBottom },
  { t: 'box', label: t('Короб'), Icon: Package },
]

function makeFill(t: CellFillKind, prev?: CellFill): CellFill {
  switch (t) {
    case 'shelves':
      return { t: 'shelves', count: prev?.t === 'shelves' ? prev.count : 1 }
    case 'dividers':
      return { t: 'dividers', count: prev?.t === 'dividers' ? prev.count : 1 }
    case 'drawers':
      return { t: 'drawers', count: prev?.t === 'drawers' ? prev.count : 3, front: 'flat' }
    case 'door':
      return { t: 'door', hinge: 'left', style: 'solid' }
    case 'rod':
      return { t: 'rod' }
    case 'panel':
      return { t: 'panel' }
    case 'box':
      return { t: 'box' }
    default:
      return { t: 'empty' }
  }
}

// ────────────────────────────────────────────────────────────────────────────

export function CellsTab({ unit }: { unit: ShelfUnit }) {
  const update = useUpdate(unit.id)
  const brush = useAppStore((s) => s.ui.brush)
  const setUi = useAppStore((s) => s.setUi)
  const selCell = useAppStore((s) => s.sel.cell)
  const hoverCell = useAppStore((s) => s.hoverCell)
  const setHoverCell = useAppStore((s) => s.setHoverCell)
  const selectCell = useAppStore((s) => s.selectCell)

  const selKey = selCell && selCell.unitId === unit.id ? selCell.key : null
  const hoverKey = hoverCell && hoverCell.unitId === unit.id ? hoverCell.key : null

  const onCellClick = (key: CellKey, shift: boolean) => {
    if (shift && selKey && selKey !== key) {
      update((u) => mergeCells(u, selKey, key))
      const a = parseCellKey(selKey)
      const b = parseCellKey(key)
      selectCell(unit.id, cellKey(Math.min(a.c, b.c), Math.min(a.r, b.r)))
      return
    }
    if (brush) {
      update((u) => setCellFill(u, key, brush))
      return
    }
    selectCell(unit.id, key)
  }

  return (
    <>
      <GridMap
        unit={unit}
        brushOn={!!brush}
        selKey={selKey}
        hoverKey={hoverKey}
        onClick={onCellClick}
        onHover={(k) => setHoverCell({ unitId: unit.id, key: k })}
        onLeave={() => setHoverCell(null)}
        onSplit={(k) => update((u) => splitCell(u, k))}
      />

      {/* ── палитра-кисть ── */}
      <div className="px-2.5 pb-2">
        <div className="label pb-1">{t('Кисть')}</div>
        <div className="grid grid-cols-8 gap-1">
          {TYPES.map(({ t, label, Icon }) => {
            const on = brush?.t === t
            return (
              <Tooltip key={t} content={label} delay={220}>
                <button
                  type="button"
                  onClick={() => setUi({ brush: on ? null : makeFill(t) })}
                  className="focus-ring flex h-[26px] items-center justify-center rounded-[5px] transition-colors duration-120"
                  style={{
                    background: on ? 'color-mix(in oklab, var(--accent) 20%, transparent)' : 'var(--bg-input)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    color: on ? 'var(--accent)' : 'var(--text-dim)',
                  }}
                >
                  <Icon size={14} strokeWidth={SW} />
                </button>
              </Tooltip>
            )
          })}
        </div>

        <div className="mt-1.5 flex gap-1.5">
          <Button
            size="xs"
            className="flex-1"
            disabled={!brush}
            icon={<PaintBucket size={13} strokeWidth={SW} />}
            onClick={() => brush && update((u) => fillAllCells(u, brush))}
          >
            {t('Залить всё')}
          </Button>
          <Button
            size="xs"
            className="flex-1"
            icon={<Eraser size={13} strokeWidth={SW} />}
            onClick={() => update((u) => clearAllCells(u))}
          >
            {t('Очистить')}
          </Button>
          <IconButton
            label={t('Отзеркалить')}
            size="xs"
            onClick={() => update((u) => mirrorCells(u))}
          >
            <FlipHorizontal size={13} strokeWidth={SW} />
          </IconButton>
        </div>
      </div>

      {selKey ? (
        <CellParams unit={unit} keyId={selKey} />
      ) : (
        <div
          className="px-3 py-3 text-[11px] leading-snug"
          style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border-soft)' }}
        >
          {t('Кликните ячейку на карте, чтобы настроить её. Shift + клик — объединить с выбранной.')}
        </div>
      )}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Карта-сетка
// ────────────────────────────────────────────────────────────────────────────

function GridMap({
  unit,
  brushOn,
  selKey,
  hoverKey,
  onClick,
  onHover,
  onLeave,
  onSplit,
}: {
  unit: ShelfUnit
  brushOn: boolean
  selKey: CellKey | null
  hoverKey: CellKey | null
  onClick: (key: CellKey, shift: boolean) => void
  onHover: (key: CellKey) => void
  onLeave: () => void
  onSplit: (key: CellKey) => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [boxW, setBoxW] = useState(292)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const f = unit.frame
  const W = outerWidth(f)
  const H = outerHeight(f)
  const foot = effFootHeight(f)
  const { rects } = cellRects(unit)

  const pad = Math.max(W, H) * 0.035
  const vbW = W + pad * 2
  const vbH = H + pad * 2
  // масштаб «мм → px» при preserveAspectRatio=meet
  const scale = Math.min(boxW / vbW, MAP_H / vbH) || 0.1
  const mmPerPx = 1 / scale

  const X = (x: number) => x + W / 2
  const Y = (y: number) => H - y

  return (
    <div className="px-2.5 pt-2.5 pb-2">
      <div
        ref={box}
        className="overflow-hidden rounded-[7px]"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
      >
        <svg
          width="100%"
          height={MAP_H}
          viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerLeave={onLeave}
          style={{ display: 'block', cursor: brushOn ? 'copy' : 'default' }}
        >
          {/* корпус */}
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            rx={Math.min(W, H) * 0.012}
            fill="var(--text-dim)"
            fillOpacity={0.18}
            stroke="var(--border-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {/* зона опор */}
          {foot > 0 && (
            <rect
              x={0}
              y={H - foot}
              width={W}
              height={foot}
              fill="var(--text-faint)"
              fillOpacity={0.22}
              stroke="var(--border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {rects.map((r) => (
            <CellNode
              key={r.key}
              rect={r}
              X={X}
              Y={Y}
              selected={r.key === selKey}
              hovered={r.key === hoverKey}
              mmPerPx={mmPerPx}
              onClick={onClick}
              onHover={onHover}
              onSplit={onSplit}
            />
          ))}
        </svg>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="num" style={{ color: 'var(--text-faint)' }}>
          {nCols(f)} × {nRows(f)}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
          {t('ряд 1 — внизу')}
        </span>
      </div>
    </div>
  )
}

function CellNode({
  rect,
  X,
  Y,
  selected,
  hovered,
  mmPerPx,
  onClick,
  onHover,
  onSplit,
}: {
  rect: CellRect
  X: (v: number) => number
  Y: (v: number) => number
  selected: boolean
  hovered: boolean
  mmPerPx: number
  onClick: (key: CellKey, shift: boolean) => void
  onHover: (key: CellKey) => void
  onSplit: (key: CellKey) => void
}) {
  const sx = X(rect.x0)
  const sy = Y(rect.y1)
  const sw = rect.x1 - rect.x0
  const sh = rect.y1 - rect.y0
  const merged = rect.span.c > 1 || rect.span.r > 1
  const btn = 15 * mmPerPx

  return (
    <g>
      {selected && (
        <rect
          x={sx}
          y={sy}
          width={sw}
          height={sh}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.3}
          strokeWidth={6}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <rect
        x={sx}
        y={sy}
        width={sw}
        height={sh}
        fill={hovered ? 'var(--bg-hover)' : 'var(--bg-panel)'}
        stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
        strokeWidth={selected ? 2 : 1}
        vectorEffect="non-scaling-stroke"
      />

      <FillArt fill={rect.cell.fill} sx={sx} sy={sy} sw={sw} sh={sh} />

      {/* прозрачная зона захвата поверх содержимого */}
      <rect
        x={sx}
        y={sy}
        width={sw}
        height={sh}
        fill="transparent"
        style={{ cursor: 'inherit' }}
        onPointerEnter={() => onHover(rect.key)}
        onClick={(e) => onClick(rect.key, e.shiftKey)}
      />

      {merged && (
        <g
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            onSplit(rect.key)
          }}
        >
          <circle
            cx={sx + sw - btn * 0.75}
            cy={sy + btn * 0.75}
            r={btn * 0.5}
            fill="var(--bg-elevated)"
            stroke="var(--border-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${sx + sw - btn} ${sy + btn * 0.5} l${btn * 0.5} ${btn * 0.5} M${sx + sw - btn * 0.5} ${sy + btn * 0.5} l${-btn * 0.5} ${btn * 0.5}`}
            stroke="var(--text-dim)"
            strokeWidth={1.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  )
}

/** Схематичное содержимое ячейки — «чертёж» в мм-координатах SVG */
function FillArt({
  fill,
  sx,
  sy,
  sw,
  sh,
}: {
  fill: CellFill
  sx: number
  sy: number
  sw: number
  sh: number
}) {
  const line = {
    stroke: 'var(--text-dim)',
    strokeWidth: 1.4,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinecap: 'round' as const,
  }
  const m = Math.min(sw, sh)

  switch (fill.t) {
    case 'shelves': {
      const n = Math.max(1, fill.count)
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const y = sy + (sh * (i + 1)) / (n + 1)
            return <line key={i} x1={sx} y1={y} x2={sx + sw} y2={y} {...line} />
          })}
        </g>
      )
    }
    case 'dividers': {
      const n = Math.max(1, fill.count)
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const x = sx + (sw * (i + 1)) / (n + 1)
            return <line key={i} x1={x} y1={sy} x2={x} y2={sy + sh} {...line} />
          })}
        </g>
      )
    }
    case 'drawers': {
      const n = Math.max(1, fill.count)
      const bh = sh / n
      const inset = m * 0.04
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const y = sy + bh * i
            const cy = y + bh / 2
            return (
              <g key={i}>
                <rect
                  x={sx + inset}
                  y={y + inset}
                  width={sw - inset * 2}
                  height={bh - inset * 2}
                  fill="var(--text-faint)"
                  fillOpacity={0.16}
                  stroke="var(--text-dim)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={sx + sw * 0.32}
                  y1={cy}
                  x2={sx + sw * 0.68}
                  y2={cy}
                  stroke="var(--text)"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}
        </g>
      )
    }
    case 'door': {
      const apex =
        fill.hinge === 'left'
          ? { x: sx, y: sy + sh / 2 }
          : fill.hinge === 'right'
            ? { x: sx + sw, y: sy + sh / 2 }
            : { x: sx + sw / 2, y: sy }
      const far: [{ x: number; y: number }, { x: number; y: number }] =
        fill.hinge === 'left'
          ? [
              { x: sx + sw, y: sy },
              { x: sx + sw, y: sy + sh },
            ]
          : fill.hinge === 'right'
            ? [
                { x: sx, y: sy },
                { x: sx, y: sy + sh },
              ]
            : [
                { x: sx, y: sy + sh },
                { x: sx + sw, y: sy + sh },
              ]
      const r = Math.hypot(far[0].x - apex.x, far[0].y - apex.y)
      const sweep = fill.hinge === 'left' ? 1 : 0
      return (
        <g>
          <rect x={sx} y={sy} width={sw} height={sh} fill="var(--text-faint)" fillOpacity={0.22} />
          <path
            d={`M${far[0].x} ${far[0].y} A${r} ${r} 0 0 ${sweep} ${far[1].x} ${far[1].y}`}
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth={1.1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${far[0].x} ${far[0].y} L${apex.x} ${apex.y} L${far[1].x} ${far[1].y}`}
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth={1}
            strokeOpacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={fill.hinge === 'up' ? sx + sw * 0.2 : apex.x}
            y1={fill.hinge === 'up' ? sy : sy + sh * 0.2}
            x2={fill.hinge === 'up' ? sx + sw * 0.8 : apex.x}
            y2={fill.hinge === 'up' ? sy : sy + sh * 0.8}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )
    }
    case 'rod': {
      const y = sy + sh * 0.16
      const rr = m * 0.05
      return (
        <g>
          <line x1={sx + sw * 0.1} y1={y} x2={sx + sw * 0.9} y2={y} {...line} strokeWidth={2} />
          <circle cx={sx + sw * 0.3} cy={y + rr * 1.6} r={rr} fill="none" {...line} strokeWidth={1.2} />
          <circle cx={sx + sw * 0.5} cy={y + rr * 1.6} r={rr} fill="none" {...line} strokeWidth={1.2} />
          <circle cx={sx + sw * 0.7} cy={y + rr * 1.6} r={rr} fill="none" {...line} strokeWidth={1.2} />
        </g>
      )
    }
    case 'panel':
      return <rect x={sx} y={sy} width={sw} height={sh} fill="var(--text-faint)" fillOpacity={0.48} />
    case 'box': {
      const i = m * 0.1
      return (
        <rect
          x={sx + i}
          y={sy + i}
          width={sw - i * 2}
          height={sh - i * 2}
          rx={m * 0.09}
          fill="var(--text-faint)"
          fillOpacity={0.3}
          stroke="var(--text-dim)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    default:
      return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Параметры выбранной ячейки
// ────────────────────────────────────────────────────────────────────────────

function CellParams({ unit, keyId }: { unit: ShelfUnit; keyId: CellKey }) {
  const update = useUpdate(unit.id)
  const { c, r } = parseCellKey(keyId)
  const cell: Cell = unit.cells[keyId] ?? { fill: { t: 'empty' }, span: { c: 1, r: 1 } }
  const fill = cell.fill
  const nc = nCols(unit.frame)
  const nr = nRows(unit.frame)
  const perCell = unit.frame.back === 'per-cell'
  const merged = cell.span.c > 1 || cell.span.r > 1

  const setFill = (next: CellFill) => update((u) => setCellFill(u, keyId, next))
  const patch = (p: Partial<Cell>) => update((u) => patchCell(u, keyId, p))

  const applyRow = () =>
    update((u) => {
      for (let i = 0; i < nCols(u.frame); i++) setCellFill(u, cellKey(i, r), fill)
    })
  const applyCol = () =>
    update((u) => {
      for (let i = 0; i < nRows(u.frame); i++) setCellFill(u, cellKey(c, i), fill)
    })

  return (
    <Section title={t('Ячейка — кол. {c}, ряд {r}', { c: c + 1, r: r + 1 })} defaultOpen>
      <div className="grid grid-cols-8 gap-1 px-3 pb-1.5">
        {TYPES.map(({ t, label, Icon }) => {
          const on = fill.t === t
          return (
            <Tooltip key={t} content={label} delay={220}>
              <button
                type="button"
                onClick={() => setFill(makeFill(t, fill))}
                className="focus-ring flex h-[26px] items-center justify-center rounded-[5px] transition-colors duration-120"
                style={{
                  background: on ? 'var(--bg-active)' : 'var(--bg-input)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--text)' : 'var(--text-faint)',
                }}
              >
                <Icon size={14} strokeWidth={SW} />
              </button>
            </Tooltip>
          )
        })}
      </div>

      {(fill.t === 'shelves' || fill.t === 'dividers') && (
        <Field label={fill.t === 'shelves' ? t('Полок') : t('Перегородок')}>
          <Stepper
            value={fill.count}
            min={1}
            max={8}
            onChange={(v) => setFill({ ...fill, count: v })}
          />
        </Field>
      )}

      {fill.t === 'drawers' && (
        <>
          <Field label={t('Ящиков')}>
            <Stepper value={fill.count} min={1} max={6} onChange={(v) => setFill({ ...fill, count: v })} />
          </Field>
          {/* ключ словаря «Фасад» уже занят видом «фасад здания» — берём точный термин */}
          <Field label={t('Фасад ящика')}>
            <Segmented<DrawerFront>
              full
              size="xs"
              value={fill.front}
              options={[
                { value: 'flat', label: t('Гладкий') },
                { value: 'grooved', label: t('Фрезеровка') },
                { value: 'handleless', label: t('Без ручки') },
              ]}
              onChange={(v) => setFill({ ...fill, front: v })}
            />
          </Field>
        </>
      )}

      {fill.t === 'door' && (
        <>
          <Field label={t('Петли')}>
            <Segmented<DoorHinge>
              full
              size="xs"
              value={fill.hinge}
              options={[
                { value: 'left', label: t('Слева') },
                { value: 'right', label: t('Справа') },
                { value: 'up', label: t('Вверх') },
              ]}
              onChange={(v) => setFill({ ...fill, hinge: v })}
            />
          </Field>
          <Field label={t('Стиль')}>
            <Segmented<DoorStyle>
              full
              size="xs"
              value={fill.style}
              options={[
                { value: 'solid', label: t('Глухая') },
                { value: 'glass', label: t('Стекло') },
                { value: 'slatted', label: t('Реечная') },
              ]}
              onChange={(v) => setFill({ ...fill, style: v })}
            />
          </Field>
        </>
      )}

      <Field label={t('Материал')}>
        <MaterialPicker
          value={cell.material ?? unit.materials.shelf}
          options={STRUCTURAL_MATERIALS}
          onChange={(id) => patch({ material: id })}
        />
        <IconButton
          label={t('Вернуть общий материал')}
          size="xs"
          variant="ghost"
          disabled={!cell.material}
          onClick={() => patch({ material: undefined })}
        >
          <RotateCcw size={13} strokeWidth={SW} />
        </IconButton>
      </Field>

      <Field
        label={t('Задняя стенка')}
        hint={perCell ? undefined : t('Доступно при режиме «По ячейкам»')}
      >
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {perCell ? (cell.back ? t('Есть') : t('Нет')) : t('Режим «По ячейкам»')}
          </span>
          <Toggle
            checked={cell.back === true}
            disabled={!perCell}
            onChange={(v) => patch({ back: v })}
          />
        </div>
      </Field>

      <Field label={t('Ширина')} hint={t('Объединение по колонкам')}>
        <Stepper
          value={Math.min(cell.span.c, nc - c)}
          min={1}
          max={Math.max(1, nc - c)}
          suffix={t('яч.')}
          onChange={(v) => patch({ span: { c: v, r: cell.span.r } })}
        />
      </Field>
      <Field label={t('Высота')} hint={t('Объединение по рядам')}>
        <Stepper
          value={Math.min(cell.span.r, nr - r)}
          min={1}
          max={Math.max(1, nr - r)}
          suffix={t('яч.')}
          onChange={(v) => patch({ span: { c: cell.span.c, r: v } })}
        />
      </Field>

      <div className="mt-1 flex flex-col gap-1.5 px-3">
        <Button
          size="xs"
          full
          disabled={!merged}
          icon={<Ungroup size={13} strokeWidth={SW} />}
          onClick={() => update((u) => splitCell(u, keyId))}
        >
          {t('Разъединить')}
        </Button>
        <div className="flex gap-1.5">
          <Button size="xs" className="flex-1" onClick={applyRow}>
            {t('Ко всему ряду')}
          </Button>
          <Button size="xs" className="flex-1" onClick={applyCol}>
            {t('Ко всей колонке')}
          </Button>
        </div>
      </div>
    </Section>
  )
}
