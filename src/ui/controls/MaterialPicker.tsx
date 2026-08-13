import { useRef, useState } from 'react'
import clsx from 'clsx'
import type { MaterialDef } from '@/domain/types'
import {
  MATERIALS,
  getMaterial,
  groupName,
  matPriceKg,
  matPriceM2,
  materialName,
  materialsByGroup,
} from '@/domain/materials'
import { t } from '@/i18n'
import { moneyPer } from '@/i18n/currency'
import { Popover, Scroll, Tooltip } from './primitives'

/** CSS-приближение материала для свотча — без обращения к three-текстурам */
export function swatchStyle(def: MaterialDef): React.CSSProperties {
  const c = def.color
  const base: React.CSSProperties = { background: c }
  switch (def.texture) {
    case 'wood':
      return {
        background: `
          repeating-linear-gradient(94deg,
            color-mix(in srgb, ${c} 100%, #000 0%) 0px,
            color-mix(in srgb, ${c} 82%, #000 18%) 2px,
            color-mix(in srgb, ${c} 100%, #fff 6%) 4px,
            color-mix(in srgb, ${c} 90%, #000 10%) 7px),
          linear-gradient(160deg, color-mix(in srgb, ${c} 88%, #fff 12%), ${c} 55%, color-mix(in srgb, ${c} 85%, #000 15%))
        `,
      }
    case 'ply-edge':
      return {
        background: `
          repeating-linear-gradient(0deg,
            color-mix(in srgb, ${c} 100%, #000 0%) 0px,
            color-mix(in srgb, ${c} 88%, #000 12%) 3px,
            color-mix(in srgb, ${c} 100%, #fff 8%) 5px),
          ${c}
        `,
      }
    case 'brushed':
      return {
        background: `
          repeating-linear-gradient(90deg,
            color-mix(in srgb, ${c} 100%, #fff 14%) 0px,
            ${c} 1px,
            color-mix(in srgb, ${c} 84%, #000 16%) 2px),
          linear-gradient(120deg, color-mix(in srgb, ${c} 70%, #fff 30%), ${c} 40%, color-mix(in srgb, ${c} 70%, #000 30%))
        `,
      }
    case 'powder':
      return {
        background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${c} 82%, #fff 18%), ${c} 62%, color-mix(in srgb, ${c} 88%, #000 12%))`,
      }
    case 'laminate':
      return {
        background: `linear-gradient(147deg, color-mix(in srgb, ${c} 92%, #fff 8%), ${c} 60%, color-mix(in srgb, ${c} 94%, #000 6%))`,
      }
    default:
      return base
  }
}

export function Swatch({
  materialId,
  size = 18,
  selected,
  round = 5,
}: {
  materialId: string
  size?: number
  selected?: boolean
  round?: number
}) {
  const def = getMaterial(materialId)
  return (
    <span
      className="relative inline-block shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: round,
        ...swatchStyle(def),
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
        boxShadow: selected ? '0 0 0 1.5px color-mix(in oklab, var(--accent) 45%, transparent)' : 'var(--shadow-sm)',
        opacity: def.transparent ? 0.62 : 1,
      }}
    />
  )
}

export function MaterialPicker({
  value,
  onChange,
  options = MATERIALS,
  compact,
}: {
  value: string
  onChange: (id: string) => void
  options?: MaterialDef[]
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const groups = materialsByGroup(options)

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex h-[24px] min-w-0 flex-1 items-center gap-1.5 rounded-[5px] px-1.5 transition-colors"
        style={{
          background: 'var(--bg-input)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
        }}
      >
        <Swatch materialId={value} size={15} round={4} />
        {!compact && (
          <span className="min-w-0 flex-1 truncate text-left text-[12px]" style={{ color: 'var(--text)' }}>
            {materialName(value)}
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--text-faint)' }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} width={268}>
        <Scroll className="max-h-[340px] py-1">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="label px-2.5 pt-2 pb-1">{groupName(group)}</div>
              {items.map((m) => {
                const on = m.id === value
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id)
                      setOpen(false)
                    }}
                    className={clsx('flex w-full items-center gap-2 px-2.5 py-[5px] text-left transition-colors')}
                    style={{ background: on ? 'var(--bg-active)' : 'transparent' }}
                    onPointerEnter={(e) => {
                      if (!on) e.currentTarget.style.background = 'var(--bg-hover)'
                    }}
                    onPointerLeave={(e) => {
                      if (!on) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Swatch materialId={m.id} size={22} selected={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px]" style={{ color: 'var(--text)' }}>
                        {materialName(m.id)}
                      </span>
                      <span className="num block text-[10px]" style={{ color: 'var(--text-faint)' }}>
                        {/* цена берётся аксессором — он уже отдал её в валюте сборки */}
                        {m.kind === 'metal'
                          ? moneyPer(matPriceKg(m), t('кг'))
                          : matPriceM2(m) > 0
                            ? moneyPer(matPriceM2(m), t('м²'))
                            : '—'}
                        {' · '}
                        {m.thicknesses[0]}–{m.thicknesses[m.thicknesses.length - 1]} {t('мм')}
                      </span>
                    </span>
                    {on && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--accent)' }}>
                        <path d="M2.5 6.4l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </Scroll>
      </Popover>
    </>
  )
}

/** Компактный ряд свотчей — быстрый выбор из ограниченного набора */
export function SwatchRow({
  value,
  onChange,
  ids,
}: {
  value: string
  onChange: (id: string) => void
  ids: string[]
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Tooltip key={id} content={materialName(id)} delay={220}>
          <button type="button" onClick={() => onChange(id)} className="focus-ring rounded-[6px]">
            <Swatch materialId={id} size={20} selected={id === value} round={5} />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
