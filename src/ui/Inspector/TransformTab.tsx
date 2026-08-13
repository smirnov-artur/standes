import {
  AlignHorizontalDistributeCenter,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Copy,
  Eye,
  EyeOff,
  Layers2,
  Lock,
  LockOpen,
  RotateCcw,
  RotateCw,
  Trash2,
  Weight,
} from 'lucide-react'
import { useMemo } from 'react'

import type { ShelfUnit, Vec2 } from '@/domain/types'
import { elevationOf, footprintAABB, outerHeight, outerWidth, unitTopY } from '@/domain/frame'
import { computeUnitBom } from '@/domain/bom'
import { fmtDims, fmtMass, fmtNum } from '@/domain/format'
import { appState, useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { Badge, Button, Divider, Field, IconButton, NumberField, Section, Toggle } from '@/ui/controls'

const SW = 1.75
const TAU = Math.PI * 2
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** Потолок высоты установки — тот же, что зажимает elevationOf() в домене */
const MAX_ELEVATION = 6000

type AlignMode = 'left' | 'right' | 'front' | 'back' | 'row'

export function TransformTab({ unit }: { unit: ShelfUnit }) {
  const setUnitTransform = useAppStore((s) => s.setUnitTransform)
  const commitTransforms = useAppStore((s) => s.commitTransforms)
  const duplicateUnits = useAppStore((s) => s.duplicateUnits)
  const removeUnits = useAppStore((s) => s.removeUnits)
  const stackOn = useAppStore((s) => s.stackOn)
  const selIds = useAppStore((s) => s.sel.units)
  const units = useAppStore((s) => s.project.units)
  const selCount = selIds.length

  const deg = ((((unit.rotY * R2D) % 360) + 360) % 360)
  const bom = computeUnitBom(unit)
  const elev = elevationOf(unit)

  // высота установки едет вместе с позицией: трансформ у юнита один, и менять
  // его надо целиком, иначе правка X сбросила бы поднятую секцию на пол
  const move = (patch: Partial<Vec2>) =>
    setUnitTransform(
      unit.id,
      { x: patch.x ?? unit.pos.x, z: patch.z ?? unit.pos.z },
      unit.rotY,
      elev,
    )
  const rotate = (nextDeg: number) =>
    setUnitTransform(unit.id, unit.pos, (((nextDeg * D2R) % TAU) + TAU) % TAU, elev)
  const lift = (v: number) =>
    setUnitTransform(unit.id, unit.pos, unit.rotY, Math.max(0, Math.min(MAX_ELEVATION, v)))

  /**
   * Пара для штабеля: нижним считаем того, кто ниже стоит.
   * При равной высоте (обычные два юнита с пола) нижний — первый выбранный:
   * ставим «то, что выбрали вторым, на то, что выбрали первым».
   */
  const pair = useMemo(() => {
    if (selIds.length !== 2) return null
    const a = units.find((u) => u.id === selIds[0])
    const b = units.find((u) => u.id === selIds[1])
    if (!a || !b) return null
    const bottom = elevationOf(b) < elevationOf(a) ? b : a
    return { bottom, top: bottom === a ? b : a }
  }, [selIds, units])

  const setFlag = (patch: { locked?: boolean; hidden?: boolean }) =>
    useAppStore.setState((s) => {
      const u = s.project.units.find((x) => x.id === unit.id)
      if (!u) return
      if (patch.locked !== undefined) u.locked = patch.locked
      if (patch.hidden !== undefined) u.hidden = patch.hidden
    })

  const align = (mode: AlignMode) => {
    const st = appState()
    const ids = st.sel.units
    const list = st.project.units.filter((u) => ids.includes(u.id) && !u.locked)
    if (list.length < 2) return
    const boxes = list.map((u) => ({ u, bb: footprintAABB(u) }))
    const next: Record<string, { pos: Vec2; rotY: number }> = {}

    if (mode === 'row') {
      const sorted = [...boxes].sort((a, b) => a.bb.minX - b.bb.minX)
      let cursor = sorted[0].bb.minX
      for (const b of sorted) {
        const w = b.bb.maxX - b.bb.minX
        next[b.u.id] = { pos: { x: b.u.pos.x + (cursor - b.bb.minX), z: b.u.pos.z }, rotY: b.u.rotY }
        cursor += w
      }
    } else if (mode === 'left') {
      const x = Math.min(...boxes.map((b) => b.bb.minX))
      for (const b of boxes) next[b.u.id] = { pos: { x: b.u.pos.x + (x - b.bb.minX), z: b.u.pos.z }, rotY: b.u.rotY }
    } else if (mode === 'right') {
      const x = Math.max(...boxes.map((b) => b.bb.maxX))
      for (const b of boxes) next[b.u.id] = { pos: { x: b.u.pos.x + (x - b.bb.maxX), z: b.u.pos.z }, rotY: b.u.rotY }
    } else if (mode === 'front') {
      const z = Math.max(...boxes.map((b) => b.bb.maxZ))
      for (const b of boxes) next[b.u.id] = { pos: { x: b.u.pos.x, z: b.u.pos.z + (z - b.bb.maxZ) }, rotY: b.u.rotY }
    } else {
      const z = Math.min(...boxes.map((b) => b.bb.minZ))
      for (const b of boxes) next[b.u.id] = { pos: { x: b.u.pos.x, z: b.u.pos.z + (z - b.bb.minZ) }, rotY: b.u.rotY }
    }
    commitTransforms(next)
  }

  const multi = selCount > 1

  return (
    <>
      <Section title={t('Положение')}>
        <Field label="X">
          <NumberField
            value={Math.round(unit.pos.x)}
            step={10}
            scrub={2}
            suffix={t('мм')}
            onChange={(v) => move({ x: v })}
          />
        </Field>
        <Field label="Z">
          <NumberField
            value={Math.round(unit.pos.z)}
            step={10}
            scrub={2}
            suffix={t('мм')}
            onChange={(v) => move({ z: v })}
          />
        </Field>
        <Field label={t('Высота установки')} hint={t('От пола до низа секции')}>
          <NumberField
            value={Math.round(elev)}
            min={0}
            max={MAX_ELEVATION}
            step={10}
            scrub={2}
            suffix={t('мм')}
            onChange={lift}
          />
        </Field>

        <div className="flex items-center gap-2 px-3 pb-1">
          <span className="num min-w-0 flex-1 truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
            {t('низ {a} мм · верх {b} мм', {
              a: fmtNum(Math.round(elev)),
              b: fmtNum(Math.round(unitTopY(unit))),
            })}
          </span>
          <Button
            size="xs"
            disabled={elev <= 0}
            icon={<ArrowDownToLine size={13} strokeWidth={SW} />}
            onClick={() => lift(0)}
          >
            {t('На пол')}
          </Button>
        </div>

        {pair && (
          <div className="px-3 pb-1">
            <Button
              size="xs"
              full
              icon={<Layers2 size={13} strokeWidth={SW} />}
              onClick={() => stackOn(pair.top.id, pair.bottom.id)}
            >
              {t('Поставить друг на друга')}
            </Button>
            <div className="mt-1 text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
              {t('«{top}» встанет на «{bottom}»', { top: pair.top.name, bottom: pair.bottom.name })}
            </div>
          </div>
        )}

        <Field label={t('Поворот')}>
          <NumberField
            value={Math.round(deg)}
            min={0}
            max={360}
            step={1}
            scrub={0.5}
            suffix="°"
            bar
            onChange={rotate}
          />
        </Field>

        <div className="mt-1 flex gap-1.5 px-3">
          <Button
            size="xs"
            className="flex-1"
            icon={<RotateCcw size={13} strokeWidth={SW} />}
            onClick={() => rotate(deg - 90)}
          >
            90°
          </Button>
          <Button
            size="xs"
            className="flex-1"
            icon={<RotateCw size={13} strokeWidth={SW} />}
            onClick={() => rotate(deg + 90)}
          >
            90°
          </Button>
          <Button size="xs" className="flex-1" onClick={() => rotate(deg + 180)}>
            180°
          </Button>
          <Button size="xs" className="flex-1" onClick={() => rotate(0)}>
            {t('Сброс')}
          </Button>
        </div>
      </Section>

      <Section title={t('Выравнивание')}>
        <div className="px-3 pb-1 text-[10.5px] leading-tight" style={{ color: 'var(--text-faint)' }}>
          {multi ? t('Выбрано: {n}', { n: selCount }) : t('Выберите два и более стеллажа')}
        </div>
        <div className="flex gap-1 px-3">
          <IconButton label={t('По левому краю')} size="sm" disabled={!multi} onClick={() => align('left')}>
            <ArrowLeftToLine size={14} strokeWidth={SW} />
          </IconButton>
          <IconButton label={t('По правому краю')} size="sm" disabled={!multi} onClick={() => align('right')}>
            <ArrowRightToLine size={14} strokeWidth={SW} />
          </IconButton>
          <IconButton label={t('По переду')} size="sm" disabled={!multi} onClick={() => align('front')}>
            <ArrowDownToLine size={14} strokeWidth={SW} />
          </IconButton>
          <IconButton label={t('По заду')} size="sm" disabled={!multi} onClick={() => align('back')}>
            <ArrowUpToLine size={14} strokeWidth={SW} />
          </IconButton>
        </div>
        <div className="mt-1.5 px-3">
          <Button
            size="xs"
            full
            disabled={!multi}
            icon={<AlignHorizontalDistributeCenter size={13} strokeWidth={SW} />}
            onClick={() => align('row')}
          >
            {t('Разложить в ряд вплотную')}
          </Button>
        </div>
      </Section>

      <Section title={t('Свойства')}>
        <Field label={t('Блокировка')}>
          <div className="flex flex-1 items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              {unit.locked ? <Lock size={13} strokeWidth={SW} /> : <LockOpen size={13} strokeWidth={SW} />}
              {unit.locked ? t('Заблокирован') : t('Свободен')}
            </span>
            <Toggle checked={unit.locked} onChange={(v) => setFlag({ locked: v })} />
          </div>
        </Field>
        <Field label={t('Видимость')}>
          <div className="flex flex-1 items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              {unit.hidden ? <EyeOff size={13} strokeWidth={SW} /> : <Eye size={13} strokeWidth={SW} />}
              {unit.hidden ? t('Скрыт') : t('Виден')}
            </span>
            <Toggle checked={unit.hidden} onChange={(v) => setFlag({ hidden: v })} />
          </div>
        </Field>

        <div className="flex items-center gap-2 px-3 pt-1.5 pb-0.5">
          <Badge>
            <span className="num">
              {fmtDims(outerWidth(unit.frame), outerHeight(unit.frame), unit.frame.depth)}
            </span>
          </Badge>
          <Badge tone="accent">
            <span className="num inline-flex items-center gap-1">
              <Weight size={11} strokeWidth={SW} />
              {fmtMass(bom.totals.mass)}
            </span>
          </Badge>
        </div>

        <Divider className="my-2" />

        <div className="flex gap-1.5 px-3">
          <Button
            size="xs"
            className="flex-1"
            icon={<Copy size={13} strokeWidth={SW} />}
            onClick={() => duplicateUnits([unit.id])}
          >
            {t('Дублировать')}
          </Button>
          <Button
            size="xs"
            variant="danger"
            className="flex-1"
            icon={<Trash2 size={13} strokeWidth={SW} />}
            onClick={() => removeUnits([unit.id])}
          >
            {t('Удалить')}
          </Button>
        </div>
      </Section>
    </>
  )
}
