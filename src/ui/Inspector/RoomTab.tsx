import { Check } from 'lucide-react'

import type { Room, ViewSettings } from '@/domain/types'
import { FLOOR_MATERIALS } from '@/domain/materials'
import { outerWidth } from '@/domain/frame'
import { fmtArea, fmtNum } from '@/domain/format'
import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import {
  Badge,
  Field,
  MaterialPicker,
  NumberField,
  Section,
  Segmented,
  Select,
  Toggle,
} from '@/ui/controls'

/**
 * Контрастная «краска» поверх цвета отделки. Токены темы тут не годятся: галочка
 * лежит на цвете стены, а не на фоне панели, и должна читаться и на светлом, и
 * на тёмном образце. Оттенок выводится из самого цвета — как в swatchStyle.
 */
function inkOn(hex: string): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join('') : raw
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (full.length < 6 || !Number.isFinite(n)) return `color-mix(in srgb, ${hex} 20%, #000)`
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return `color-mix(in srgb, ${hex} 20%, ${lum > 0.5 ? '#000' : '#fff'})`
}

/** Ходовые цвета стен — это данные отделки, а не токены интерфейса */
const WALL_COLORS = [
  '#e9e6e0',
  '#f4f1ea',
  '#d9d5cc',
  '#c8ccc6',
  '#b9c3c8',
  '#a8a29a',
  '#7d8a86',
  '#3f4448',
]

const VIEW_TOGGLES: { key: 'showGrid' | 'showDimensions' | 'showMagnets' | 'showRoom' | 'ghost'; label: string }[] = [
  { key: 'showGrid', label: t('Сетка пола') },
  { key: 'showDimensions', label: t('Размеры') },
  { key: 'showMagnets', label: t('Магниты') },
  { key: 'showRoom', label: t('Комната') },
  { key: 'ghost', label: t('Призрак') },
]

/** пределы совпадают с перетаскиванием стен на плане */
const ROOM_MIN = 1000
const ROOM_MAX = 30000

/**
 * Типовые площади торгового зала.
 *
 * Люди держат в голове не «7 200 × 5 400», а «сотка». Чип переводит площадь в
 * габариты: зал вытянут примерно 4:3 — так стеллажные ряды ложатся вдоль
 * длинной стены, а не упираются в квадрат.
 */
const QUICK_AREAS = [20, 50, 100, 200, 400]

function areaDims(m2: number): { width: number; depth: number } {
  const w = Math.sqrt((m2 * 4000000) / 3)
  const round = (v: number) => Math.min(ROOM_MAX, Math.max(ROOM_MIN, Math.round(v / 100) * 100))
  return { width: round(w), depth: round((w * 3) / 4) }
}

/** «7,2 × 5,4 м» / «7.2 × 5.4 m» */
function dimsLabel(width: number, depth: number): string {
  return `${fmtNum(width / 1000, 1)} × ${fmtNum(depth / 1000, 1)} ${t('м')}`
}

export function RoomTab() {
  const room = useAppStore((s) => s.project.room)
  const updateRoom = useAppStore((s) => s.updateRoom)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const units = useAppStore((s) => s.project.units)

  const roomArea = (room.width * room.depth) / 1e6
  const usedArea = units.reduce((s, u) => s + outerWidth(u.frame) * u.frame.depth, 0) / 1e6
  const tight = roomArea > 0 && usedArea > roomArea * 0.45

  return (
    <>
      <Section title={t('Размеры комнаты')}>
        <Field label={t('Быстрый размер')} wide>
          <div className="flex flex-wrap gap-1">
            {QUICK_AREAS.map((a) => {
              const d = areaDims(a)
              const on = d.width === room.width && d.depth === room.depth
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => updateRoom(d)}
                  className="focus-ring flex flex-1 basis-[58px] flex-col items-center justify-center gap-px rounded-md px-1.5 py-1 transition-colors duration-120"
                  style={{
                    background: on ? 'var(--bg-active)' : 'var(--bg-elevated)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    color: on ? 'var(--text)' : 'var(--text-dim)',
                  }}
                >
                  <span className="num text-[11.5px] font-medium">
                    {fmtNum(a, 0)} {t('м²')}
                  </span>
                  <span className="num text-[9.5px]" style={{ color: 'var(--text-faint)' }}>
                    {dimsLabel(d.width, d.depth)}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
        <div className="px-3 pb-1.5 text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
          {t('Стены можно тянуть мышью в режиме «План».')}
        </div>

        <Field label={t('Показывать комнату')}>
          <div className="flex flex-1 justify-end">
            <Toggle checked={view.showRoom} onChange={(v) => setView({ showRoom: v })} />
          </div>
        </Field>

        <Field label={t('Ширина')}>
          <NumberField
            value={room.width}
            min={ROOM_MIN}
            max={ROOM_MAX}
            step={100}
            scrub={20}
            suffix={t('мм')}
            bar
            onChange={(v) => updateRoom({ width: Math.round(v) })}
          />
        </Field>
        <Field label={t('Глубина')}>
          <NumberField
            value={room.depth}
            min={ROOM_MIN}
            max={ROOM_MAX}
            step={100}
            scrub={20}
            suffix={t('мм')}
            bar
            onChange={(v) => updateRoom({ depth: Math.round(v) })}
          />
        </Field>
        <Field label={t('Высота')}>
          <NumberField
            value={room.height}
            min={1000}
            max={20000}
            step={100}
            scrub={20}
            suffix={t('мм')}
            bar
            onChange={(v) => updateRoom({ height: Math.round(v) })}
          />
        </Field>
        <Field label={t('Толщина стен')}>
          <NumberField
            value={room.wallThickness}
            min={60}
            max={400}
            step={10}
            suffix={t('мм')}
            bar
            onChange={(v) => updateRoom({ wallThickness: Math.round(v) })}
          />
        </Field>
        <Field label={t('Плинтус')}>
          <NumberField
            value={room.skirting}
            min={0}
            max={200}
            step={10}
            suffix={t('мм')}
            bar
            onChange={(v) => updateRoom({ skirting: Math.round(v) })}
          />
        </Field>
      </Section>

      <Section title={t('Отделка')}>
        <Field label={t('Стены')}>
          <Segmented<Room['walls']>
            full
            value={room.walls}
            options={[
              { value: 'none', label: t('Нет') },
              { value: 'auto', label: t('Авто') },
              { value: 'all', label: t('Все') },
            ]}
            onChange={(v) => updateRoom({ walls: v })}
          />
        </Field>
        <div className="px-3 pb-1 pl-[106px] text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
          {t('Авто — прячет стены, которые загораживают камеру.')}
        </div>

        <Field label={t('Потолок')}>
          <div className="flex flex-1 justify-end">
            <Toggle checked={room.ceiling} onChange={(v) => updateRoom({ ceiling: v })} />
          </div>
        </Field>

        <Field label={t('Пол')}>
          <MaterialPicker
            value={room.floorMaterial}
            options={FLOOR_MATERIALS}
            onChange={(id) => updateRoom({ floorMaterial: id })}
          />
        </Field>

        <Field label={t('Цвет стен')} wide>
          <div className="flex flex-wrap items-center gap-1.5">
            {WALL_COLORS.map((c) => {
              const on = c.toLowerCase() === room.wallColor.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => updateRoom({ wallColor: c })}
                  className="focus-ring relative flex h-[20px] w-[20px] items-center justify-center rounded-full"
                  style={{
                    background: c,
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
                    boxShadow: on
                      ? '0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent)'
                      : 'var(--shadow-sm)',
                  }}
                >
                  {on && <Check size={11} strokeWidth={2.5} style={{ color: inkOn(c) }} />}
                </button>
              )
            })}
            <input
              type="color"
              value={room.wallColor}
              onChange={(e) => updateRoom({ wallColor: e.target.value })}
              className="focus-ring h-[20px] w-[28px] cursor-pointer rounded-[5px] bg-transparent p-0"
              style={{ border: '1px solid var(--border-strong)' }}
            />
          </div>
        </Field>
      </Section>

      <Section title={t('Вид')}>
        {VIEW_TOGGLES.map((tg) => (
          <Field key={tg.key} label={tg.label}>
            <div className="flex flex-1 justify-end">
              <Toggle checked={view[tg.key]} onChange={(v) => setView({ [tg.key]: v })} />
            </div>
          </Field>
        ))}
        <Field label={t('Окружение')}>
          <Select<ViewSettings['env']>
            value={view.env}
            options={[
              { value: 'studio', label: t('Студия') },
              { value: 'loft', label: t('Лофт') },
              { value: 'warm', label: t('Тёплый') },
              { value: 'night', label: t('Ночь') },
            ]}
            onChange={(v) => setView({ env: v })}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-1.5 px-3 py-2">
        <Badge>
          <span className="num">
            {t('Комната')} {fmtArea(roomArea)}
          </span>
        </Badge>
        <Badge tone={tight ? 'warn' : 'accent'}>
          <span className="num">
            {t('Занято')} {fmtArea(usedArea)}
          </span>
        </Badge>
      </div>
    </>
  )
}
