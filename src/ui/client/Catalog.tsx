/**
 * Витрина готовых торговых секций.
 *
 * Клиенту торгового оборудования незачем видеть комоды, витрины и гардеробы —
 * в каталог попадают только пресеты со style === 'retail'.
 * Превью рисуется чистым SVG по той же размерной математике, что и сцена,
 * поэтому карточка никогда не расходится с тем, что появится в 3D.
 */

import { useMemo, type ReactNode } from 'react'

import { PRESETS, type Preset } from '@/domain/defaults'
import { computeBom } from '@/domain/bom'
import {
  colSpans,
  effFootHeight,
  horizontalSpans,
  outerHeight,
  outerWidth,
  retailSpec,
  verticalSpans,
} from '@/domain/frame'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import type { ShelfUnit } from '@/domain/types'
import { useAppStore } from '@/store/useStore'

/** Пресеты статичны — юниты для превью собираются один раз на модуль */
const CARDS: { preset: Preset; unit: ShelfUnit }[] = PRESETS.map((preset) => ({
  preset,
  unit: preset.make(),
})).filter(({ unit }) => unit.frame.style === 'retail')

const STROKE = { vectorEffect: 'non-scaling-stroke' } as const

// ────────────────────────────────────────────────────────────────────────────
//  Превью секции — фасад торгового стеллажа
// ────────────────────────────────────────────────────────────────────────────

export function RetailPreview({ unit }: { unit: ShelfUnit }) {
  const f = unit.frame
  const r = retailSpec(f)
  const W = outerWidth(f)
  const H = outerHeight(f)
  const foot = effFootHeight(f)
  const vs = verticalSpans(f)
  const hs = horizontalSpans(f)
  const cs = colSpans(f)

  const pad = Math.max(W, H) * 0.03
  const nodes: ReactNode[] = []

  // задняя стенка — фон между стойками
  if (f.back !== 'none') {
    nodes.push(
      <rect
        key="back"
        x={-W / 2}
        y={foot + r.baseHeight}
        width={W}
        height={Math.max(0, H - foot - r.baseHeight)}
        fill="var(--text-faint)"
        fillOpacity={r.perforated ? 0.1 : 0.16}
        stroke="none"
      />,
    )
  }

  // стойки
  for (let i = 0; i < vs.length; i++) {
    nodes.push(
      <rect
        key={`up${i}`}
        x={vs[i].a}
        y={foot}
        width={Math.max(vs[i].b - vs[i].a, W * 0.008)}
        height={H - foot}
        fill="var(--text-dim)"
        fillOpacity={0.5}
        stroke="var(--text-dim)"
        strokeWidth={1}
        {...STROKE}
      />,
    )
  }

  // база
  nodes.push(
    <rect
      key="base"
      x={-W / 2}
      y={foot}
      width={W}
      height={Math.max(r.baseHeight, H * 0.012)}
      fill="var(--text-dim)"
      fillOpacity={0.34}
      stroke="var(--text-dim)"
      strokeWidth={1.1}
      {...STROKE}
    />,
  )

  // полки: каждый горизонтальный уровень выше базы
  const bar = Math.max(H * 0.008, 16)
  for (let i = 1; i < hs.length; i++) {
    const y = (hs[i].a + hs[i].b) / 2
    if (y <= foot + r.baseHeight) continue
    for (const c of cs) {
      nodes.push(
        <rect
          key={`sh${i}-${c.a}`}
          x={c.a}
          y={y - bar / 2}
          width={c.b - c.a}
          height={bar}
          fill="var(--text-dim)"
          fillOpacity={0.62}
          stroke="none"
        />,
      )
      if (r.priceRail) {
        nodes.push(
          <rect
            key={`pr${i}-${c.a}`}
            x={c.a}
            y={y - bar / 2 - Math.max(H * 0.006, 12)}
            width={c.b - c.a}
            height={Math.max(H * 0.004, 8)}
            fill="var(--accent)"
            fillOpacity={0.75}
            stroke="none"
          />,
        )
      }
    }
  }

  // карниз
  if (r.header > 0) {
    nodes.push(
      <rect
        key="header"
        x={-W / 2}
        y={H}
        width={W}
        height={r.header}
        fill="var(--text-dim)"
        fillOpacity={0.28}
        stroke="var(--text-dim)"
        strokeWidth={1}
        {...STROKE}
      />,
    )
  }

  const total = H + Math.max(0, r.header)

  return (
    <svg
      viewBox={`0 0 ${W + pad * 2} ${total + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      aria-hidden
    >
      <g transform={`translate(${W / 2 + pad},${total + pad}) scale(1,-1)`}>{nodes}</g>
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Карточка
// ────────────────────────────────────────────────────────────────────────────

function Card({ preset, unit, price }: { preset: Preset; unit: ShelfUnit; price: number }) {
  const addPreset = useAppStore((s) => s.addPreset)
  const toast = useAppStore((s) => s.toast)

  return (
    <button
      type="button"
      title={t(preset.hint)}
      onClick={() => {
        addPreset(preset.id)
        toast(t('Добавлено: {name}', { name: t(preset.name) }))
      }}
      onPointerEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'none'
      }}
      className="focus-ring flex flex-col gap-1.5 overflow-hidden rounded-lg p-2 text-left transition-[transform,border-color] duration-150"
      style={{
        background: 'var(--bg-panel-2)',
        border: '1px solid var(--border)',
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      <div
        className="flex h-[110px] w-full items-center justify-center overflow-hidden rounded-md p-1.5"
        style={{ background: 'var(--bg-input)' }}
      >
        <RetailPreview unit={unit} />
      </div>

      {/*
        Название — ровно две строки с переносом по словам: английские имена
        секций длиннее русских, и многоточие съедало половину названия.
        Высота зафиксирована, чтобы карточки в сетке не прыгали по высоте.
      */}
      <div
        style={{
          color: 'var(--text)',
          fontSize: 12,
          lineHeight: 1.25,
          height: 30,
          flexShrink: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'break-word',
        }}
      >
        {t(preset.name)}
      </div>

      <div
        style={{
          color: 'var(--text-faint)',
          fontSize: 11,
          lineHeight: 1.3,
          height: 29,
          flexShrink: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'break-word',
        }}
      >
        {t(preset.hint)}
      </div>

      <div className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
        {t('от')} {money(price)}
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function ClientCatalog() {
  // смета пресетов не зависит от проекта — считаем один раз за жизнь панели
  const priced = useMemo(
    () => CARDS.map((c) => ({ ...c, price: computeBom([c.unit]).totals.price })),
    [],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3.5">
      <div className="mb-1 text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
        {t('Готовые секции')}
      </div>
      <div className="mb-3 text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>
        {t('Выберите секцию — она появится в зале. Размеры и цвет настроите дальше.')}
      </div>

      {priced.length === 0 ? (
        <div
          className="rounded-lg p-3 text-[12px] leading-snug"
          style={{
            background: 'var(--bg-panel-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          {t('Каталог торговых секций пока пуст — загляните чуть позже.')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {priced.map(({ preset, unit, price }) => (
            <Card key={preset.id} preset={preset} unit={unit} price={price} />
          ))}
        </div>
      )}
    </div>
  )
}
