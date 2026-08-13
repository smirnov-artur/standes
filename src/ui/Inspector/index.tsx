import { useCallback } from 'react'
import {
  Boxes,
  CircleAlert,
  Frame,
  Grid2x2,
  Home,
  Info,
  Move3d,
  Palette,
  Plus,
  TriangleAlert,
} from 'lucide-react'

import type { InspectorTab, ShelfUnit, Warning } from '@/domain/types'
import { outerHeight, outerWidth } from '@/domain/frame'
import { getUnitGeometry } from '@/domain/geometry'
import { fmtDims } from '@/domain/format'
import { useActiveUnit, useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { Badge, Button, Scroll, Segmented, type SegmentedOption } from '@/ui/controls'

import { FrameTab } from './FrameTab'
import { CellsTab } from './CellsTab'
import { MaterialsTab } from './MaterialsTab'
import { TransformTab } from './TransformTab'
import { RoomTab } from './RoomTab'

const ICON = 14
const SW = 1.75

/** Единая точка мутации активного юнита для всех вкладок инспектора */
export function useUpdate(unitId: string) {
  const updateUnit = useAppStore((s) => s.updateUnit)
  return useCallback((fn: (u: ShelfUnit) => void) => updateUnit(unitId, fn), [unitId, updateUnit])
}

const TABS: { value: InspectorTab; label: string; icon: React.ReactNode }[] = [
  { value: 'frame', label: t('Каркас'), icon: <Frame size={ICON} strokeWidth={SW} /> },
  { value: 'cells', label: t('Ячейки'), icon: <Grid2x2 size={ICON} strokeWidth={SW} /> },
  { value: 'materials', label: t('Материалы'), icon: <Palette size={ICON} strokeWidth={SW} /> },
  { value: 'transform', label: t('Положение'), icon: <Move3d size={ICON} strokeWidth={SW} /> },
  { value: 'room', label: t('Комната'), icon: <Home size={ICON} strokeWidth={SW} /> },
]

export function Inspector() {
  const unit = useActiveUnit()
  const tab = useAppStore((s) => s.ui.tab)
  const setUi = useAppStore((s) => s.setUi)
  const addUnit = useAppStore((s) => s.addUnit)

  const warnings: Warning[] = unit ? getUnitGeometry(unit).warnings : []

  // подпись показывается только у активной вкладки — иначе 5 подписей не влезают в 320px
  const options: SegmentedOption<InspectorTab>[] = TABS.map((t) => ({
    value: t.value,
    icon: t.icon,
    title: t.label,
    label: t.value === tab ? <span className="whitespace-nowrap">{t.label}</span> : undefined,
  }))

  // Ширину и левую границу задаёт хост (App) — панель только заполняет её.
  return (
    <div className="flex h-full min-h-0 w-full flex-col" style={{ background: 'var(--bg-panel)' }}>
      {/* ── шапка ── */}
      <div
        className="flex h-[34px] shrink-0 items-center gap-2 px-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
          {unit ? unit.name : t('Инспектор')}
        </span>
        {unit && (
          <Badge>
            <span className="num">
              {fmtDims(outerWidth(unit.frame), outerHeight(unit.frame), unit.frame.depth)}
            </span>
          </Badge>
        )}
      </div>

      {/* ── вкладки ── */}
      <div className="shrink-0 px-2 py-1.5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <Segmented<InspectorTab>
          full
          value={tab}
          options={options}
          onChange={(v) => setUi({ tab: v })}
        />
      </div>

      {/* ── тело ── */}
      <Scroll>
        {tab === 'room' ? (
          <RoomTab />
        ) : !unit ? (
          <Empty onAdd={() => addUnit()} />
        ) : tab === 'frame' ? (
          <FrameTab unit={unit} />
        ) : tab === 'cells' ? (
          <CellsTab unit={unit} />
        ) : tab === 'materials' ? (
          <MaterialsTab unit={unit} />
        ) : (
          <TransformTab unit={unit} />
        )}
      </Scroll>

      {/* ── предупреждения ── */}
      {warnings.length > 0 && <Warnings items={warnings} />}
    </div>
  )
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Boxes size={30} strokeWidth={1.25} style={{ color: 'var(--text-faint)' }} />
      <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
        {t('Выберите стеллаж')}
      </div>
      <div className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
        {t('Кликните по стеллажу в сцене или создайте новый')}
      </div>
      <Button variant="primary" size="sm" icon={<Plus size={13} strokeWidth={SW} />} onClick={onAdd}>
        {t('Добавить')}
      </Button>
    </div>
  )
}

function Warnings({ items }: { items: Warning[] }) {
  return (
    <div
      className="max-h-[132px] shrink-0 overflow-y-auto overscroll-contain py-1"
      style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel-2)' }}
    >
      {items.map((w, i) => {
        const tone =
          w.level === 'error'
            ? 'var(--danger)'
            : w.level === 'warn'
              ? 'var(--warn)'
              : 'var(--text-dim)'
        const Icon = w.level === 'error' ? CircleAlert : w.level === 'warn' ? TriangleAlert : Info
        return (
          <div key={`${w.code}-${w.cellKey ?? ''}-${i}`} className="flex items-start gap-1.5 px-2.5 py-[3px]">
            <Icon size={13} strokeWidth={SW} style={{ color: tone, marginTop: 1, flexShrink: 0 }} />
            <span className="min-w-0 flex-1 text-[11px] leading-[1.35]" style={{ color: 'var(--text-dim)' }}>
              {w.message}
            </span>
          </div>
        )
      })}
    </div>
  )
}
