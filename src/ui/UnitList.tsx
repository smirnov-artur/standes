import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Archive,
  Copy,
  DoorClosed,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Lock,
  LockOpen,
  PackageOpen,
  Plus,
  Shirt,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import { outerSize } from '@/domain/frame'
import type { ShelfUnit } from '@/domain/types'
import { t } from '@/i18n'
import { useAppStore } from '@/store/useStore'
import { Button, IconButton, Section, TextField } from '@/ui/controls'

const ROW_H = 30

// ────────────────────────────────────────────────────────────────────────────
//  Служебное
// ────────────────────────────────────────────────────────────────────────────

/**
 * Замена всего списка юнитов: порядок и флаги locked/hidden нельзя провести
 * через updateUnit — он намеренно игнорирует заблокированные юниты, а порядок
 * вообще не его забота. Проект пересобирается целиком, выбор восстанавливается.
 */
function commitUnits(units: ShelfUnit[]) {
  const st = useAppStore.getState()
  const sel = st.sel
  const cell = sel.cell
  st.loadProject({ ...st.project, units, updatedAt: Date.now() })
  const after = useAppStore.getState()
  const alive = new Set(units.map((u) => u.id))
  const keep = sel.units.filter((id) => alive.has(id))
  if (keep.length) after.select(keep)
  if (cell && alive.has(cell.unitId)) after.selectCell(cell.unitId, cell.key)
}

function setUnitFlag(id: string, patch: { hidden?: boolean; locked?: boolean }) {
  const units = useAppStore.getState().project.units
  commitUnits(units.map((u) => (u.id === id ? { ...u, ...patch } : u)))
}

/** Иконка-марка по составу ячеек */
function markOf(u: ShelfUnit): LucideIcon {
  let drawers = false
  let rod = false
  for (const key of Object.keys(u.cells)) {
    const t = u.cells[key].fill.t
    if (t === 'door') return DoorClosed
    if (t === 'drawers') drawers = true
    else if (t === 'rod') rod = true
  }
  if (drawers) return Archive
  if (rod) return Shirt
  return LayoutGrid
}

// ────────────────────────────────────────────────────────────────────────────
//  Строка
// ────────────────────────────────────────────────────────────────────────────

interface RowProps {
  unit: ShelfUnit
  index: number
  ghost: boolean
  editing: boolean
  onEdit: (id: string | null) => void
  onGrip: (e: ReactPointerEvent, index: number) => void
  onPick: (e: ReactPointerEvent, index: number) => void
}

function UnitRow({ unit, index, ghost, editing, onEdit, onGrip, onPick }: RowProps) {
  const selected = useAppStore((s) => s.sel.units.includes(unit.id))
  const hovered3d = useAppStore((s) => s.hoverUnit === unit.id)
  const setHoverUnit = useAppStore((s) => s.setHoverUnit)
  const updateUnit = useAppStore((s) => s.updateUnit)
  const duplicateUnits = useAppStore((s) => s.duplicateUnits)
  const removeUnits = useAppStore((s) => s.removeUnits)

  const [hot, setHot] = useState(false)
  const [draft, setDraft] = useState(unit.name)
  const editRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(false)

  const dims = useMemo(() => {
    const s = outerSize(unit.frame)
    return `${Math.round(s.x)}×${Math.round(s.y)}×${Math.round(s.z)}`
  }, [unit.frame])

  useEffect(() => {
    if (!editing) return
    cancelRef.current = false
    const input = editRef.current?.querySelector('input')
    input?.focus()
    input?.select()
  }, [editing])

  const commitName = () => {
    if (cancelRef.current) {
      cancelRef.current = false
      onEdit(null)
      return
    }
    const name = draft.trim()
    if (name && name !== unit.name) updateUnit(unit.id, (u) => void (u.name = name))
    onEdit(null)
  }

  const Mark = markOf(unit)
  const showActions = hot || selected
  const bg = selected ? 'var(--bg-active)' : hovered3d || hot ? 'var(--bg-hover)' : 'transparent'

  return (
    <div
      className="relative flex shrink-0 items-center gap-1 pr-1 pl-2 transition-colors duration-120"
      style={{ height: ROW_H, background: bg, opacity: ghost ? 0.45 : 1 }}
      onPointerEnter={() => {
        setHot(true)
        setHoverUnit(unit.id)
      }}
      onPointerLeave={() => {
        setHot(false)
        setHoverUnit(null)
      }}
      onPointerDown={(e) => {
        if (editing || e.button !== 0) return
        onPick(e, index)
      }}
    >
      {selected && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-[2px]"
          style={{ background: 'var(--accent)' }}
        />
      )}

      <span
        className="flex h-[22px] w-[12px] shrink-0 cursor-grab items-center justify-center"
        style={{ color: 'var(--text-faint)', touchAction: 'none' }}
        onPointerDown={(e) => onGrip(e, index)}
        title={t('Перетащить')}
      >
        <GripVertical size={11} strokeWidth={1.75} />
      </span>

      <Mark
        size={13}
        strokeWidth={1.75}
        className="shrink-0"
        style={{ color: selected ? 'var(--accent)' : 'var(--text-dim)' }}
      />

      {editing ? (
        <div
          ref={editRef}
          className="flex min-w-0 flex-1 items-center"
          onBlur={commitName}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              cancelRef.current = true
              onEdit(null)
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <TextField value={draft} onChange={setDraft} onEnter={commitName} />
        </div>
      ) : (
        <>
          <span
            className="min-w-0 flex-1 truncate text-[12px]"
            style={{ color: unit.hidden ? 'var(--text-faint)' : 'var(--text)' }}
            title={`${unit.name} · ${dims} ${t('мм')}`}
            onDoubleClick={() => {
              if (unit.locked) return
              setDraft(unit.name)
              onEdit(unit.id)
            }}
          >
            {unit.name}
          </span>

          <div className="flex shrink-0 items-center">
            {showActions ? (
              <>
                <IconButton
                  size="xs"
                  variant="ghost"
                  label={unit.hidden ? t('Показать') : t('Скрыть')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setUnitFlag(unit.id, { hidden: !unit.hidden })}
                >
                  {unit.hidden ? (
                    <EyeOff size={13} strokeWidth={1.75} />
                  ) : (
                    <Eye size={13} strokeWidth={1.75} />
                  )}
                </IconButton>
                <IconButton
                  size="xs"
                  variant="ghost"
                  label={unit.locked ? t('Разблокировать') : t('Заблокировать')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setUnitFlag(unit.id, { locked: !unit.locked })}
                >
                  {unit.locked ? (
                    <Lock size={13} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <LockOpen size={13} strokeWidth={1.75} />
                  )}
                </IconButton>
                <IconButton
                  size="xs"
                  variant="ghost"
                  label={t('Дублировать')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => duplicateUnits([unit.id])}
                >
                  <Copy size={13} strokeWidth={1.75} />
                </IconButton>
                {/* «danger» подан цветом иконки: вариант danger рисует фон и рамку
                    и разваливает ряд из четырёх плоских кнопок в строке 30px */}
                <IconButton
                  size="xs"
                  variant="ghost"
                  label={t('Удалить')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeUnits([unit.id])}
                >
                  <Trash2 size={13} strokeWidth={1.75} style={{ color: 'var(--danger)' }} />
                </IconButton>
              </>
            ) : (
              <span className="num pr-1 whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
                {dims}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Список
// ────────────────────────────────────────────────────────────────────────────

export function UnitList() {
  const units = useAppStore((s) => s.project.units)
  const addUnit = useAppStore((s) => s.addUnit)

  const [editing, setEditing] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: number; at: number } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef(0)

  const count = units.length

  const pick = (e: ReactPointerEvent, index: number) => {
    const st = useAppStore.getState()
    const list = st.project.units
    if (index < 0 || index >= list.length) return
    const id = list[index].id
    if (e.shiftKey) {
      const a = Math.max(0, Math.min(anchorRef.current, list.length - 1))
      const lo = Math.min(a, index)
      const hi = Math.max(a, index)
      st.select(list.slice(lo, hi + 1).map((u) => u.id))
      return
    }
    anchorRef.current = index
    if (e.ctrlKey || e.metaKey) st.toggleSelect(id)
    else st.select([id])
  }

  const grip = (e: ReactPointerEvent, from: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const host = rowsRef.current
    if (!host || count < 2) return

    const slot = (clientY: number) => {
      const r = host.getBoundingClientRect()
      return Math.max(0, Math.min(count, Math.round((clientY - r.top) / ROW_H)))
    }

    setDrag({ from, at: from })
    const move = (ev: PointerEvent) => {
      const at = slot(ev.clientY)
      setDrag((d) => (d && d.at !== at ? { ...d, at } : d))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const at = slot(ev.clientY)
      setDrag(null)
      const list = useAppStore.getState().project.units
      if (from >= list.length) return
      const to = Math.max(0, Math.min(list.length - 1, at > from ? at - 1 : at))
      if (to === from) return
      const next = list.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      commitUnits(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const showLine = drag !== null && drag.at !== drag.from && drag.at !== drag.from + 1

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <Section
        title={t('Стеллажи')}
        right={
          <span className="num" style={{ color: 'var(--text-faint)' }}>
            {count}
          </span>
        }
      >
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6">
            <PackageOpen size={22} strokeWidth={1.5} style={{ color: 'var(--text-faint)' }} />
            <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
              {t('Пока пусто')}
            </div>
            <Button
              size="sm"
              icon={<Plus size={13} strokeWidth={1.75} />}
              onClick={() => addUnit()}
            >
              {t('Добавить стеллаж')}
            </Button>
          </div>
        ) : (
          <div ref={rowsRef} className="relative flex flex-col">
            {units.map((u, i) => (
              <UnitRow
                key={u.id}
                unit={u}
                index={i}
                ghost={drag?.from === i}
                editing={editing === u.id}
                onEdit={setEditing}
                onGrip={grip}
                onPick={pick}
              />
            ))}
            {showLine && drag && (
              <span
                className="pointer-events-none absolute right-0 left-0 h-[2px] rounded-full"
                style={{ top: drag.at * ROW_H - 1, background: 'var(--accent)' }}
              />
            )}
          </div>
        )}
      </Section>
    </div>
  )
}
