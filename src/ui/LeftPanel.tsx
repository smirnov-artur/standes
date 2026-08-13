import { useDeferredValue, useMemo } from 'react'
import { Boxes, Plus } from 'lucide-react'

import { computeBom } from '@/domain/bom'
import { fmtMass } from '@/domain/format'
import { getUnitGeometry } from '@/domain/geometry'
import { INTL_LOCALE, plural, t } from '@/i18n'
import { money } from '@/i18n/currency'
import { IconButton, Section } from '@/ui/controls'
import { PresetGallery } from '@/ui/PresetGallery'
import { UnitList } from '@/ui/UnitList'
import { useAppStore } from '@/store/useStore'

/** Счётчики в подвале — разряды по локали сборки */
const NUM = new Intl.NumberFormat(INTL_LOCALE)

interface Summary {
  units: number
  parts: number
  price: string
  mass: string
}

function Footer() {
  const units = useAppStore((s) => s.project.units)
  // смета считается тяжело — не даём ей блокировать ввод в инспекторе
  const deferred = useDeferredValue(units)

  const sum = useMemo<Summary>(() => {
    // скрытые стеллажи в смету не идут — так же считают нижняя панель и раскрой
    const visible = deferred.filter((u) => !u.hidden)
    let parts = 0
    let price = '—'
    let mass = '—'
    try {
      for (const u of visible) parts += getUnitGeometry(u).parts.length
    } catch {
      parts = 0
    }
    try {
      const bom = computeBom(visible)
      price = money(bom.totals.price)
      mass = fmtMass(bom.totals.mass)
    } catch {
      price = '—'
      mass = '—'
    }
    return { units: deferred.length, parts, price, mass }
  }, [deferred])

  return (
    <div
      className="flex shrink-0 flex-col justify-center gap-0.5 px-2.5"
      style={{ height: 54, borderTop: '1px solid var(--border)' }}
    >
      <div className="truncate text-[10.5px] leading-none" style={{ color: 'var(--text-faint)' }}>
        {NUM.format(sum.units)} {plural(sum.units, 'стеллаж', 'стеллажа', 'стеллажей')} ·{' '}
        {NUM.format(sum.parts)} {plural(sum.parts, 'деталь', 'детали', 'деталей')}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[14px] leading-tight font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {sum.price}
        </span>
        <span className="num shrink-0" style={{ color: 'var(--text-dim)' }}>
          {sum.mass}
        </span>
      </div>
    </div>
  )
}

export function LeftPanel() {
  const addUnit = useAppStore((s) => s.addUnit)

  // Ширину и правую границу задаёт хост (App), панель просто заполняет её:
  // иначе получаются двойная линия шва и лишний пиксель по горизонтали.
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      style={{ background: 'var(--bg-panel)' }}
    >
      <div
        className="flex h-[34px] shrink-0 items-center gap-1.5 px-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Boxes size={14} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
        <span className="label flex-1 truncate">{t('Сцена')}</span>
        <IconButton
          size="xs"
          variant="ghost"
          label={t('Добавить стеллаж')}
          onClick={() => addUnit()}
        >
          <Plus size={13} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="shrink-0">
        <Section title={t('Библиотека')} defaultOpen={false}>
          <PresetGallery />
        </Section>
      </div>

      <UnitList />

      <Footer />
    </div>
  )
}
