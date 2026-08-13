import type { ShelfUnit, UnitMaterials } from '@/domain/types'
import { FRONT_MATERIALS, MATERIALS, STRUCTURAL_MATERIALS, materialName } from '@/domain/materials'
import { computeBom } from '@/domain/bom'
import { fmtArea } from '@/domain/format'
import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import { Field, MaterialPicker, Section, Swatch, SwatchRow } from '@/ui/controls'

const METAL_MATERIALS = MATERIALS.filter((m) => m.kind === 'metal')

const QUICK: Record<keyof UnitMaterials, string[]> = {
  carcass: ['birch-ply', 'oak', 'walnut', 'ash-white', 'laminate-white', 'laminate-graphite'],
  shelf: ['birch-ply', 'oak', 'walnut', 'laminate-white', 'laminate-graphite', 'glass-clear'],
  back: ['hdf-back', 'birch-ply', 'laminate-white', 'laminate-graphite', 'felt-grey', 'glass-smoked'],
  front: ['laminate-white', 'laminate-graphite', 'mdf-sand', 'mdf-olive', 'oak', 'glass-smoked'],
  accent: ['steel-black', 'steel-white', 'steel-brushed', 'brass'],
}

interface Palette {
  id: string
  name: string
  m: UnitMaterials
}

const PALETTES: Palette[] = [
  {
    id: 'scandi',
    name: 'Скандинавия',
    m: { carcass: 'birch-ply', shelf: 'birch-ply', back: 'hdf-back', front: 'laminate-white', accent: 'steel-white' },
  },
  {
    id: 'loft',
    name: 'Лофт',
    m: { carcass: 'steel-black', shelf: 'oak', back: 'hdf-back', front: 'laminate-graphite', accent: 'steel-black' },
  },
  {
    id: 'study',
    name: 'Тёмный кабинет',
    m: { carcass: 'walnut', shelf: 'walnut', back: 'felt-grey', front: 'glass-smoked', accent: 'brass' },
  },
  {
    id: 'white',
    name: 'Белый минимализм',
    m: { carcass: 'laminate-white', shelf: 'laminate-white', back: 'hdf-back', front: 'laminate-white', accent: 'steel-white' },
  },
  {
    id: 'oak',
    name: 'Тёплый дуб',
    m: { carcass: 'oak', shelf: 'oak', back: 'hdf-back', front: 'mdf-sand', accent: 'brass' },
  },
  {
    id: 'graphite',
    name: 'Графит',
    m: {
      carcass: 'laminate-graphite',
      shelf: 'laminate-graphite',
      back: 'hdf-back',
      front: 'laminate-graphite',
      accent: 'steel-brushed',
    },
  },
]

// ────────────────────────────────────────────────────────────────────────────

export function MaterialsTab({ unit }: { unit: ShelfUnit }) {
  const updateUnits = useAppStore((s) => s.updateUnits)
  const selUnits = useAppStore((s) => s.sel.units)

  const targets = selUnits.length > 0 ? selUnits : [unit.id]
  const set = (patch: Partial<UnitMaterials>) =>
    updateUnits(targets, (u) => {
      Object.assign(u.materials, patch)
    })

  const bom = computeBom([unit])

  return (
    <>
      <Section title={t('Материалы')}>
        <Slot
          label={t('Корпус')}
          value={unit.materials.carcass}
          options={STRUCTURAL_MATERIALS}
          quick={QUICK.carcass}
          onChange={(id) => set({ carcass: id })}
        />
        <Slot
          label={t('Полки')}
          value={unit.materials.shelf}
          options={STRUCTURAL_MATERIALS}
          quick={QUICK.shelf}
          onChange={(id) => set({ shelf: id })}
        />
        <Slot
          label={t('Задняя стенка')}
          value={unit.materials.back}
          options={MATERIALS}
          quick={QUICK.back}
          onChange={(id) => set({ back: id })}
        />
        <Slot
          label={t('Фасады')}
          value={unit.materials.front}
          options={FRONT_MATERIALS}
          quick={QUICK.front}
          onChange={(id) => set({ front: id })}
        />
        <Slot
          label={t('Акценты')}
          value={unit.materials.accent}
          options={METAL_MATERIALS}
          quick={QUICK.accent}
          onChange={(id) => set({ accent: id })}
        />
      </Section>

      <Section
        title={t('Готовые сочетания')}
        right={
          targets.length > 1 ? (
            <span className="num" style={{ color: 'var(--text-faint)' }}>
              {t('{n} шт.', { n: targets.length })}
            </span>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-1.5 px-3 pt-0.5">
          {PALETTES.map((p) => {
            const active =
              unit.materials.carcass === p.m.carcass &&
              unit.materials.shelf === p.m.shelf &&
              unit.materials.front === p.m.front &&
              unit.materials.accent === p.m.accent
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set(p.m)}
                className="focus-ring flex flex-col gap-1 rounded-[6px] p-1.5 transition-colors duration-120"
                style={{
                  background: active ? 'var(--bg-active)' : 'var(--bg-input)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
                onPointerEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onPointerLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-input)'
                }}
              >
                <span className="flex gap-1">
                  <Swatch materialId={p.m.carcass} size={16} round={4} />
                  <Swatch materialId={p.m.shelf} size={16} round={4} />
                  <Swatch materialId={p.m.front} size={16} round={4} />
                  <Swatch materialId={p.m.accent} size={16} round={4} />
                </span>
                <span
                  className="truncate text-left text-[11px] leading-none"
                  style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}
                >
                  {t(p.name)}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title={t('Сводка по материалам')}>
        {bom.byMaterial.length === 0 ? (
          <div className="px-3 py-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {t('Нет деталей')}
          </div>
        ) : (
          <div className="flex flex-col">
            {bom.byMaterial.map((row) => (
              <div key={row.materialId} className="flex h-[24px] items-center gap-1.5 px-3">
                <Swatch materialId={row.materialId} size={14} round={4} />
                <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: 'var(--text-dim)' }}>
                  {materialName(row.materialId)}
                </span>
                <span className="num w-[58px] shrink-0 text-right" style={{ color: 'var(--text-faint)' }}>
                  {fmtArea(row.area)}
                </span>
                <span className="num w-[66px] shrink-0 text-right" style={{ color: 'var(--text)' }}>
                  {money(row.price)}
                </span>
              </div>
            ))}
            <div
              className="mt-1 flex h-[24px] items-center gap-1.5 px-3"
              style={{ borderTop: '1px solid var(--border-soft)' }}
            >
              <span className="label flex-1">{t('Итого')}</span>
              <span className="num" style={{ color: 'var(--text)' }}>
                {money(bom.totals.price)}
              </span>
            </div>
          </div>
        )}
      </Section>
    </>
  )
}

function Slot({
  label,
  value,
  options,
  quick,
  onChange,
}: {
  label: string
  value: string
  options: typeof MATERIALS
  quick: string[]
  onChange: (id: string) => void
}) {
  return (
    <div className="pb-1">
      <Field label={label} hint={materialName(value)}>
        <MaterialPicker value={value} options={options} onChange={onChange} />
      </Field>
      <div className="px-3 pt-[2px] pl-[106px]">
        <SwatchRow value={value} ids={quick} onChange={onChange} />
      </div>
    </div>
  )
}
