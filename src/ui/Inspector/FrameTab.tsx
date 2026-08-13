import { useCallback } from 'react'
import { AlignHorizontalDistributeCenter, CopyPlus, Minus, Plus } from 'lucide-react'

import type { BackKind, ConstructionStyle, FootKind, RetailSpec, ShelfUnit } from '@/domain/types'
import {
  MAX_COL,
  MAX_ROW,
  MAX_DEPTH,
  MIN_COL,
  MIN_DEPTH,
  MIN_ROW,
  distributeColumns,
  distributeRows,
  insertColumn,
  insertRow,
  removeColumn,
  removeRow,
  setColWidth,
  setRowHeight,
} from '@/domain/edit'
import { getMaterial } from '@/domain/materials'
import { outerHeight, outerWidth, retailSpec } from '@/domain/frame'
import { fmtLen } from '@/domain/format'
import { t } from '@/i18n'
import {
  Button,
  Field,
  IconButton,
  NumberField,
  Section,
  Segmented,
  Stepper,
  Toggle,
  useThrottledCommit,
} from '@/ui/controls'

import { useUpdate } from './index'

const SW = 1.75
const MAX_LINES = 10

// ────────────────────────────────────────────────────────────────────────────

export function FrameTab({ unit }: { unit: ShelfUnit }) {
  const update = useUpdate(unit.id)
  const f = unit.frame
  /** торговый стеллаж: металл, поэтому толщины боковин/полок из плиты не применимы */
  const isRetail = f.style === 'retail'
  /** полные параметры с добитыми дефолтами — читать frame.retail напрямую нельзя */
  const r = retailSpec(f)

  const setDepth = useThrottledCommit<number>(
    useCallback((v: number) => update((u) => void (u.frame.depth = Math.round(v))), [update]),
  )

  /** Патч торговых параметров: поле необязательное, поэтому только через spread */
  const patchRetail = useCallback(
    (patch: Partial<RetailSpec>) =>
      update((u) => void (u.frame.retail = { ...u.frame.retail, ...patch })),
    [update],
  )

  const setColCount = (n: number) =>
    update((u) => {
      while (u.frame.cols.length < n) insertColumn(u, u.frame.cols.length)
      while (u.frame.cols.length > n) removeColumn(u, u.frame.cols.length - 1)
    })

  const setRowCount = (n: number) =>
    update((u) => {
      while (u.frame.rows.length < n) insertRow(u, u.frame.rows.length)
      while (u.frame.rows.length > n) removeRow(u, u.frame.rows.length - 1)
    })

  return (
    <>
      {/* ── Габариты ── */}
      <Section title={t('Габариты')}>
        {/* у торгового стеллажа глубина живёт в своей секции — как «глубина базы» */}
        {!isRetail && (
          <Field label={t('Глубина')}>
            <NumberField
              value={f.depth}
              min={MIN_DEPTH}
              max={MAX_DEPTH}
              step={10}
              scrub={1.5}
              suffix={t('мм')}
              bar
              onChange={setDepth}
            />
          </Field>
        )}
        <Field label={t('Ширина')}>
          <ReadOut value={outerWidth(f)} />
        </Field>
        <Field label={t('Высота')}>
          <ReadOut value={outerHeight(f)} />
        </Field>

        {/* толщины из листа — только для плитных конструкций: в торговом металл */}
        {!isRetail && (
          <>
            <Field label={t('Боковины')}>
              <NumberField
                value={f.side}
                min={6}
                max={60}
                step={1}
                suffix={t('мм')}
                onChange={(v) => update((u) => void (u.frame.side = Math.round(v)))}
              />
            </Field>
            <Thicknesses
              materialId={unit.materials.carcass}
              value={f.side}
              onPick={(t) => update((u) => void (u.frame.side = t))}
            />

            <Field label={t('Полки')}>
              <NumberField
                value={f.panel}
                min={6}
                max={60}
                step={1}
                suffix={t('мм')}
                onChange={(v) => update((u) => void (u.frame.panel = Math.round(v)))}
              />
            </Field>
            <Thicknesses
              materialId={unit.materials.shelf}
              value={f.panel}
              onPick={(t) => update((u) => void (u.frame.panel = t))}
            />
          </>
        )}

        <Field label={t('Конструкция')}>
          <Segmented<ConstructionStyle>
            full
            value={f.style}
            options={[
              { value: 'carcass', label: t('Корпус') },
              { value: 'steel-frame', label: t('Каркас') },
              { value: 'retail', label: t('Торговый') },
            ]}
            onChange={(v) => update((u) => void (u.frame.style = v))}
          />
        </Field>
        {f.style === 'steel-frame' && (
          <>
            <Field label={t('Профиль')}>
              <NumberField
                value={f.profile}
                min={15}
                max={60}
                step={1}
                suffix={t('мм')}
                bar
                onChange={(v) => update((u) => void (u.frame.profile = Math.round(v)))}
              />
            </Field>
            <Field label={t('Связи')}>
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                  {t('Жёсткость')}
                </span>
                <Toggle checked={f.braces} onChange={(v) => update((u) => void (u.frame.braces = v))} />
              </div>
            </Field>
          </>
        )}
      </Section>

      {/* ── Торговый стеллаж ── */}
      {isRetail && (
        <Section title={t('Торговый стеллаж')}>
          <Field label={t('Ширина стойки')} hint={t('Ширина перфорированной стойки, мм')}>
            <NumberField
              value={f.profile}
              min={25}
              max={60}
              step={1}
              suffix={t('мм')}
              bar
              onChange={(v) => update((u) => void (u.frame.profile = Math.round(v)))}
            />
          </Field>
          <Field label={t('Глубина базы')} hint={t('Глубина нижней базы — она же пятно застройки')}>
            <NumberField
              value={f.depth}
              min={300}
              max={900}
              step={10}
              scrub={1.5}
              suffix={t('мм')}
              bar
              onChange={setDepth}
            />
          </Field>
          <Field
            label={t('Глубина полок')}
            hint={t('Не больше глубины базы — иначе секция опрокинется')}
          >
            <NumberField
              value={r.shelfDepth}
              min={200}
              max={Math.max(200, Math.min(900, f.depth))}
              step={10}
              scrub={1.5}
              suffix={t('мм')}
              bar
              onChange={(v) => patchRetail({ shelfDepth: Math.round(v) })}
            />
          </Field>
          <Field label={t('Высота базы')} hint={t('От пола до настила базы')}>
            <NumberField
              value={r.baseHeight}
              min={0}
              max={600}
              step={10}
              scrub={1.5}
              suffix={t('мм')}
              bar
              onChange={(v) => patchRetail({ baseHeight: Math.round(v) })}
            />
          </Field>
          <Field
            label={t('Наклон полок')}
            hint={t('Передний край вниз — выкладка фруктов, хлеба, прессы')}
          >
            <NumberField
              value={r.tilt}
              min={0}
              max={15}
              step={1}
              suffix="°"
              bar
              onChange={(v) => patchRetail({ tilt: Math.round(v) })}
            />
          </Field>
          <Field label={t('Отбортовка')} hint={t('Высота бортика по переднему краю полки')}>
            <NumberField
              value={r.lip}
              min={0}
              max={120}
              step={5}
              suffix={t('мм')}
              bar
              onChange={(v) => patchRetail({ lip: Math.round(v) })}
            />
          </Field>
          <Field label={t('Карниз')} hint={t('Верхний фриз над секцией, 0 — без карниза')}>
            <NumberField
              value={r.header}
              min={0}
              max={400}
              step={10}
              suffix={t('мм')}
              bar
              onChange={(v) => patchRetail({ header: Math.round(v) })}
            />
          </Field>

          <SwitchRow
            label={t('Ценникодержатели')}
            note={t('По переднему краю')}
            checked={r.priceRail}
            onChange={(v) => patchRetail({ priceRail: v })}
          />
          <SwitchRow
            label={t('Перфорация')}
            note={t('Стенки и стойки')}
            checked={r.perforated}
            onChange={(v) => patchRetail({ perforated: v })}
          />
          <SwitchRow
            label={t('Двусторонний')}
            note={t('Островной, проход с двух сторон')}
            checked={r.island}
            onChange={(v) => patchRetail({ island: v })}
          />
          {r.island && f.depth < r.shelfDepth * 2 + f.backThickness && (
            <div className="px-3 pb-1 text-[10.5px] leading-tight" style={{ color: 'var(--warn)' }}>
              {t('Для двустороннего глубина базы должна быть от')}{' '}
              <span className="num">{Math.round(r.shelfDepth * 2 + f.backThickness)}</span>{' '}
              {t('мм')}
            </div>
          )}
        </Section>
      )}

      {/* ── Колонки ── */}
      <Section
        title={t('Колонки')}
        right={
          <span className="num" style={{ color: 'var(--text-faint)' }}>
            {f.cols.length}
          </span>
        }
      >
        <Field label={t('Количество')}>
          <Stepper value={f.cols.length} min={1} max={MAX_LINES} onChange={setColCount} />
        </Field>

        <div className="mt-1 flex flex-col">
          {f.cols.map((w, i) => (
            <LineRow
              key={`c${i}`}
              index={i}
              label={t('№ {n}', { n: i + 1 })}
              value={w}
              min={MIN_COL}
              max={MAX_COL}
              canRemove={f.cols.length > 1}
              onChange={(v) => update((u) => setColWidth(u, i, v))}
              onDuplicate={() => update((u) => insertColumn(u, i + 1, w))}
              onRemove={() => update((u) => removeColumn(u, i))}
              disabledAdd={f.cols.length >= MAX_LINES}
            />
          ))}
        </div>

        <div className="mt-1.5 flex gap-1.5 px-3">
          <Button
            size="xs"
            className="flex-1"
            icon={<AlignHorizontalDistributeCenter size={13} strokeWidth={SW} />}
            onClick={() => update((u) => distributeColumns(u))}
          >
            {t('Выровнять')}
          </Button>
          <Button
            size="xs"
            className="flex-1"
            icon={<Plus size={13} strokeWidth={SW} />}
            disabled={f.cols.length >= MAX_LINES}
            onClick={() => update((u) => insertColumn(u, u.frame.cols.length))}
          >
            {t('Колонка')}
          </Button>
        </div>
      </Section>

      {/* ── Ряды ── */}
      <Section
        title={t('Ряды')}
        right={
          <span className="num" style={{ color: 'var(--text-faint)' }}>
            {f.rows.length}
          </span>
        }
      >
        <div className="px-3 pb-1 text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
          {t('Ряд 1 — нижний. Список идёт сверху вниз.')}
        </div>

        <Field label={t('Количество')}>
          <Stepper value={f.rows.length} min={1} max={MAX_LINES} onChange={setRowCount} />
        </Field>

        <div className="mt-1 flex flex-col">
          {f.rows
            .map((h, i) => ({ h, i }))
            .reverse()
            .map(({ h, i }) => (
              <LineRow
                key={`r${i}`}
                index={i}
                label={t('№ {n}', { n: i + 1 })}
                value={h}
                min={MIN_ROW}
                max={MAX_ROW}
                canRemove={f.rows.length > 1}
                onChange={(v) => update((u) => setRowHeight(u, i, v))}
                onDuplicate={() => update((u) => insertRow(u, i + 1, h))}
                onRemove={() => update((u) => removeRow(u, i))}
                disabledAdd={f.rows.length >= MAX_LINES}
              />
            ))}
        </div>

        <div className="mt-1.5 flex gap-1.5 px-3">
          <Button
            size="xs"
            className="flex-1"
            icon={<AlignHorizontalDistributeCenter size={13} strokeWidth={SW} />}
            onClick={() => update((u) => distributeRows(u))}
          >
            {t('Выровнять')}
          </Button>
          <Button
            size="xs"
            className="flex-1"
            icon={<Plus size={13} strokeWidth={SW} />}
            disabled={f.rows.length >= MAX_LINES}
            onClick={() => update((u) => insertRow(u, u.frame.rows.length))}
          >
            {t('Ряд')}
          </Button>
        </div>
      </Section>

      {/* ── Задняя стенка ── */}
      <Section title={t('Задняя стенка')}>
        <Field label={t('Тип')}>
          <Segmented<BackKind>
            full
            value={f.back}
            options={[
              { value: 'none', label: t('Нет') },
              { value: 'full', label: t('Сплошная') },
              { value: 'per-cell', label: t('По ячейкам') },
            ]}
            onChange={(v) => update((u) => void (u.frame.back = v))}
          />
        </Field>
        <Field label={t('Толщина')}>
          <NumberField
            value={f.backThickness}
            min={3}
            max={18}
            step={1}
            suffix={t('мм')}
            bar
            disabled={f.back === 'none'}
            onChange={(v) => update((u) => void (u.frame.backThickness = Math.round(v)))}
          />
        </Field>
      </Section>

      {/* ── Опоры ── */}
      <Section title={t('Опоры')}>
        <div className="grid grid-cols-5 gap-1 px-3 pb-1">
          {FEET.map((o) => {
            const on = o.value === f.feet
            return (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => update((u) => void (u.frame.feet = o.value))}
                className="focus-ring flex h-[42px] flex-col items-center justify-center gap-[3px] rounded-[6px] transition-colors duration-120"
                style={{
                  background: on ? 'var(--bg-active)' : 'var(--bg-input)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  color: on ? 'var(--text)' : 'var(--text-faint)',
                }}
              >
                <FootGlyph kind={o.value} />
                <span className="text-[9.5px] leading-none">{o.label}</span>
              </button>
            )
          })}
        </div>
        <Field label={t('Высота опор')}>
          <NumberField
            value={f.footHeight}
            min={0}
            max={300}
            step={5}
            suffix={t('мм')}
            bar
            disabled={f.feet === 'none'}
            onChange={(v) => update((u) => void (u.frame.footHeight = Math.round(v)))}
          />
        </Field>
        <Field label={t('Свес')} hint={t('Свес столешницы по бокам и вперёд')}>
          <NumberField
            value={f.topOverhang}
            min={0}
            max={120}
            step={5}
            suffix={t('мм')}
            bar
            onChange={(v) => update((u) => void (u.frame.topOverhang = Math.round(v)))}
          />
        </Field>
      </Section>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function ReadOut({ value }: { value: number }) {
  return (
    <div className="num flex-1 text-right" style={{ color: 'var(--text-dim)' }}>
      {fmtLen(value)}
    </div>
  )
}

/** Строка-переключатель: подпись слева, пояснение и тумблер справа */
function SwitchRow({
  label,
  note,
  checked,
  onChange,
}: {
  label: string
  note: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field label={label}>
      <div className="flex flex-1 items-center justify-between gap-2">
        <span className="truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          {note}
        </span>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </Field>
  )
}

/** Доступные толщины материала — клик подставляет значение */
function Thicknesses({
  materialId,
  value,
  onPick,
}: {
  materialId: string
  value: number
  onPick: (t: number) => void
}) {
  const list = getMaterial(materialId).thicknesses
  if (!list.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pt-[2px] pb-1 pl-[106px]">
      {list.map((t) => {
        const on = Math.abs(t - value) < 0.01
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="num focus-ring h-[15px] rounded-[4px] px-1 text-[9.5px] transition-colors duration-120"
            style={{
              background: on ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text-faint)',
              border: `1px solid ${on ? 'color-mix(in oklab, var(--accent) 45%, transparent)' : 'var(--border-soft)'}`,
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

function LineRow({
  label,
  value,
  min,
  max,
  canRemove,
  disabledAdd,
  onChange,
  onDuplicate,
  onRemove,
}: {
  index: number
  label: string
  value: number
  min: number
  max: number
  canRemove: boolean
  disabledAdd: boolean
  onChange: (v: number) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const throttled = useThrottledCommit<number>(onChange)
  return (
    <div
      className="flex h-[26px] items-center gap-1.5 px-3 transition-colors duration-120"
      onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span className="num w-[26px] shrink-0" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <NumberField
        value={value}
        min={min}
        max={max}
        step={10}
        scrub={1.5}
        suffix={t('мм')}
        onChange={throttled}
      />
      <IconButton
        label={t('Дублировать')}
        size="xs"
        variant="ghost"
        disabled={disabledAdd}
        onClick={onDuplicate}
      >
        <CopyPlus size={13} strokeWidth={SW} />
      </IconButton>
      <IconButton
        label={t('Удалить')}
        size="xs"
        variant="ghost"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Minus size={13} strokeWidth={SW} />
      </IconButton>
    </div>
  )
}

// ── опоры ───────────────────────────────────────────────────────────────────

const FEET: { value: FootKind; label: string }[] = [
  { value: 'none', label: t('Нет') },
  { value: 'plinth', label: t('Цоколь') },
  { value: 'legs-round', label: t('Ножки') },
  { value: 'legs-hairpin', label: t('Шпильки') },
  { value: 'levelers', label: t('Опоры') },
]

/** Схематичный значок опоры — рисуется токенами темы */
function FootGlyph({ kind }: { kind: FootKind }) {
  const s = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, fill: 'none' }
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <rect x="2.5" y="1.5" width="15" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
      {kind === 'plinth' && <rect x="4" y="7.5" width="12" height="4" rx="0.5" fill="currentColor" opacity="0.6" />}
      {kind === 'legs-round' && (
        <>
          <path d="M5.5 6.5v5" {...s} />
          <path d="M14.5 6.5v5" {...s} />
        </>
      )}
      {kind === 'legs-hairpin' && (
        <>
          <path d="M5.5 6.5L3.5 12M5.5 6.5l1.6 5.5" {...s} />
          <path d="M14.5 6.5L12.5 12M14.5 6.5l1.6 5.5" {...s} />
        </>
      )}
      {kind === 'levelers' && (
        <>
          <path d="M5.5 6.5v3" {...s} />
          <path d="M14.5 6.5v3" {...s} />
          <circle cx="5.5" cy="10.6" r="1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="14.5" cy="10.6" r="1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </>
      )}
      {kind === 'none' && <path d="M3 11.5h14" {...s} strokeDasharray="2 2" />}
    </svg>
  )
}
