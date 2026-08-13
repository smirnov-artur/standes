import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import { PRESETS, type Preset } from '@/domain/defaults'
import {
  cellRects,
  colSpans,
  effFootHeight,
  horizontalSpans,
  outerHeight,
  outerWidth,
  rowSpans,
  suppressedHorizontals,
  suppressedVerticals,
  verticalSpans,
} from '@/domain/frame'
import type { ShelfUnit } from '@/domain/types'
import { t } from '@/i18n'
import { Button } from '@/ui/controls'
import { useAppStore } from '@/store/useStore'

/**
 * Пресеты статичны, поэтому юниты для превью строятся один раз на модуль:
 * make() пересобирает объект целиком, а рисовать нужно всегда одно и то же.
 */
const PREVIEWS: { preset: Preset; unit: ShelfUnit }[] = PRESETS.map((preset) => ({
  preset,
  unit: preset.make(),
}))

// ── мини-превью: чистый SVG по доменной размерной математике ────────────────

interface Seg {
  a: number
  b: number
}

/** Склеивает соседние неподавленные участки в непрерывные отрезки */
function mergeRuns(n: number, keep: (i: number) => boolean, span: (i: number) => Seg): Seg[] {
  const out: Seg[] = []
  let cur: Seg | null = null
  for (let i = 0; i < n; i++) {
    if (keep(i)) {
      const s = span(i)
      if (cur) cur.b = s.b
      else cur = { a: s.a, b: s.b }
    } else if (cur) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out
}

const STROKE = { vectorEffect: 'non-scaling-stroke' } as const

function PresetPreview({ unit }: { unit: ShelfUnit }) {
  const f = unit.frame
  const W = outerWidth(f)
  const H = outerHeight(f)
  const foot = effFootHeight(f)
  const vs = verticalSpans(f)
  const hs = horizontalSpans(f)
  const cs = colSpans(f)
  const rs = rowSpans(f)
  const supV = suppressedVerticals(unit)
  const supH = suppressedHorizontals(unit)
  const { rects } = cellRects(unit)
  const nc = cs.length
  const nr = rs.length

  const pad = Math.max(W, H) * 0.02
  const nodes: ReactNode[] = []

  // корпус
  nodes.push(
    <rect
      key="body"
      x={-W / 2}
      y={foot}
      width={W}
      height={H - foot}
      rx={Math.min(W, H) * 0.012}
      fill="none"
      stroke="var(--text-dim)"
      strokeWidth={1.3}
      {...STROKE}
    />,
  )

  // опоры
  if (foot > 0) {
    if (f.feet === 'plinth') {
      const inset = W * 0.06
      nodes.push(
        <rect
          key="plinth"
          x={-W / 2 + inset}
          y={0}
          width={W - inset * 2}
          height={foot}
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth={1}
          {...STROKE}
        />,
      )
    } else {
      const lw = Math.max(W * 0.035, 22)
      const inset = W * 0.04
      for (const sx of [-1, 1]) {
        nodes.push(
          <rect
            key={`leg${sx}`}
            x={sx < 0 ? -W / 2 + inset : W / 2 - inset - lw}
            y={0}
            width={lw}
            height={foot}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth={1}
            {...STROKE}
          />,
        )
      }
    }
  }

  // внутренние перегородки
  for (let i = 1; i < vs.length - 1; i++) {
    const x = (vs[i].a + vs[i].b) / 2
    for (const seg of mergeRuns(
      nr,
      (r) => !supV.has(`${i}@${r}`),
      (r) => rs[r],
    )) {
      nodes.push(
        <line
          key={`v${i}-${seg.a}`}
          x1={x}
          y1={seg.a}
          x2={x}
          y2={seg.b}
          stroke="var(--text-dim)"
          strokeWidth={1}
          {...STROKE}
        />,
      )
    }
  }

  // внутренние полки
  for (let i = 1; i < hs.length - 1; i++) {
    const y = (hs[i].a + hs[i].b) / 2
    for (const seg of mergeRuns(
      nc,
      (c) => !supH.has(`${i}@${c}`),
      (c) => cs[c],
    )) {
      nodes.push(
        <line
          key={`h${i}-${seg.a}`}
          x1={seg.a}
          y1={y}
          x2={seg.b}
          y2={y}
          stroke="var(--text-dim)"
          strokeWidth={1}
          {...STROKE}
        />,
      )
    }
  }

  // заполнение ячеек
  for (const rect of rects) {
    const { key, x0, x1, y0, y1 } = rect
    const w = x1 - x0
    const h = y1 - y0
    const fill = rect.cell.fill

    if (fill.t === 'door' || fill.t === 'panel') {
      nodes.push(
        <rect
          key={`f${key}`}
          x={x0}
          y={y0}
          width={w}
          height={h}
          fill="var(--text-faint)"
          fillOpacity={fill.t === 'panel' ? 0.44 : 0.3}
          stroke="var(--text-dim)"
          strokeWidth={0.8}
          {...STROKE}
        />,
      )
      if (fill.t === 'door') {
        const hx = fill.hinge === 'right' ? x1 - w * 0.06 : x0 + w * 0.06
        const isUp = fill.hinge === 'up'
        nodes.push(
          <line
            key={`hg${key}`}
            x1={isUp ? x0 + w * 0.06 : hx}
            y1={isUp ? y1 - h * 0.06 : y0 + h * 0.12}
            x2={isUp ? x1 - w * 0.06 : hx}
            y2={isUp ? y1 - h * 0.06 : y1 - h * 0.12}
            stroke="var(--text-dim)"
            strokeWidth={1.2}
            {...STROKE}
          />,
        )
      }
    } else if (fill.t === 'drawers') {
      const n = Math.max(1, fill.count)
      const bh = h / n
      for (let i = 0; i < n; i++) {
        nodes.push(
          <rect
            key={`d${key}-${i}`}
            x={x0 + w * 0.03}
            y={y0 + bh * i + bh * 0.12}
            width={w * 0.94}
            height={bh * 0.76}
            fill="var(--text-faint)"
            fillOpacity={0.3}
            stroke="var(--text-dim)"
            strokeWidth={0.7}
            {...STROKE}
          />,
        )
      }
    } else if (fill.t === 'rod') {
      const y = y1 - h * 0.11
      nodes.push(
        <line
          key={`r${key}`}
          x1={x0 + w * 0.08}
          y1={y}
          x2={x1 - w * 0.08}
          y2={y}
          stroke="var(--text-dim)"
          strokeWidth={1.6}
          strokeLinecap="round"
          {...STROKE}
        />,
      )
    } else if (fill.t === 'shelves') {
      const n = Math.max(1, fill.count)
      for (let i = 1; i <= n; i++) {
        const y = y0 + (h * i) / (n + 1)
        nodes.push(
          <line
            key={`s${key}-${i}`}
            x1={x0}
            y1={y}
            x2={x1}
            y2={y}
            stroke="var(--text-faint)"
            strokeWidth={0.9}
            {...STROKE}
          />,
        )
      }
    } else if (fill.t === 'dividers') {
      const n = Math.max(1, fill.count)
      for (let i = 1; i <= n; i++) {
        const x = x0 + (w * i) / (n + 1)
        nodes.push(
          <line
            key={`dv${key}-${i}`}
            x1={x}
            y1={y0}
            x2={x}
            y2={y1}
            stroke="var(--text-faint)"
            strokeWidth={0.9}
            {...STROKE}
          />,
        )
      }
    } else if (fill.t === 'box') {
      nodes.push(
        <rect
          key={`b${key}`}
          x={x0 + w * 0.08}
          y={y0 + h * 0.08}
          width={w * 0.84}
          height={h * 0.7}
          fill="var(--text-faint)"
          fillOpacity={0.26}
          stroke="var(--text-dim)"
          strokeWidth={0.8}
          {...STROKE}
        />,
      )
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W + pad * 2} ${H + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      aria-hidden
    >
      <g transform={`translate(${W / 2 + pad},${H + pad}) scale(1,-1)`}>{nodes}</g>
    </svg>
  )
}

// ── карточка ────────────────────────────────────────────────────────────────

function PresetCard({ preset, unit }: { preset: Preset; unit: ShelfUnit }) {
  const addPreset = useAppStore((s) => s.addPreset)
  const toast = useAppStore((s) => s.toast)

  return (
    <button
      type="button"
      title={t(preset.hint)}
      onClick={() => {
        addPreset(preset.id)
        toast(t('Добавлен: {name}', { name: t(preset.name) }))
      }}
      onPointerEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'none'
      }}
      className="focus-ring flex flex-col gap-1 overflow-hidden rounded-md p-1.5 text-left transition-[transform,border-color] duration-150"
      style={{
        background: 'var(--bg-panel-2)',
        border: '1px solid var(--border)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <div
        className="flex h-[74px] w-full items-center justify-center overflow-hidden rounded-[4px] p-1"
        style={{ background: 'var(--bg-input)' }}
      >
        <PresetPreview unit={unit} />
      </div>
      <div className="truncate text-[12px] leading-tight" style={{ color: 'var(--text)' }}>
        {t(preset.name)}
      </div>
      <div
        className="text-[10px] leading-[1.25]"
        style={{
          color: 'var(--text-faint)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 25,
        }}
      >
        {t(preset.hint)}
      </div>
    </button>
  )
}

// ── галерея ─────────────────────────────────────────────────────────────────

export function PresetGallery() {
  const addUnit = useAppStore((s) => s.addUnit)

  return (
    <div
      className="overflow-y-auto overscroll-contain px-2.5 pt-0.5 pb-1"
      style={{ maxHeight: 'min(300px, 40vh)' }}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {PREVIEWS.map(({ preset, unit }) => (
          <PresetCard key={preset.id} preset={preset} unit={unit} />
        ))}
      </div>
      <Button
        full
        size="sm"
        className="mt-1.5"
        icon={<Plus size={13} strokeWidth={1.75} />}
        onClick={() => addUnit()}
      >
        {t('Пустой стеллаж')}
      </Button>
    </div>
  )
}
