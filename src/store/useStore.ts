import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import { useStore as useVanillaStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { enableMapSet } from 'immer'

import type {
  CellFill,
  CellKey,
  InspectorTab,
  Project,
  Room,
  Selection,
  ShelfUnit,
  SnapCandidate,
  SnapSettings,
  Vec2,
  ViewSettings,
} from '@/domain/types'
import {
  DEFAULT_SNAP,
  DEFAULT_VIEW,
  PRESETS,
  makeProject,
  makeUnit,
  uid,
} from '@/domain/defaults'
import * as E from '@/domain/edit'
import { MAX_ELEVATION, elevationOf, footprintAABB, outerSize, unitTopY } from '@/domain/frame'
import type { UnitTransform } from '@/domain/snapping'

enableMapSet()

// ────────────────────────────────────────────────────────────────────────────

/**
 * Трансформ, которым можно ЧАСТИЧНО обновить юнит: высота необязательна,
 * потому что панель «Трансформ» и горячие клавиши двигают юнит по полу
 * и про этаж ничего не знают — undefined означает «высоту не трогать».
 */
export type TransformPatch = { pos: Vec2; rotY: number; elevation?: number }

export interface DragState {
  unitIds: string[]
  mode: 'move' | 'rotate'
  /**
   * позиции/повороты/ВЫСОТЫ во время перетаскивания — НЕ попадают в историю.
   * elevation здесь обязательна: сцена рисует этаж каждый кадр и «нет значения»
   * трактовать ей нечем.
   */
  live: Record<string, UnitTransform>
  candidate: SnapCandidate | null
  colliding: string[]
}

/**
 * Кому показываем интерфейс.
 *  'client' — покупателю: крупная витрина, стандартные размеры, цена, заявка.
 *  'pro'    — менеджеру: инспектор, смета, раскрой, допуски, фурнитура.
 * Один и тот же проект, разные оболочки вокруг одной сцены.
 */
export type Audience = 'client' | 'pro'

export interface UiState {
  audience: Audience
  /** открыта форма заявки (клиентский режим) */
  lead: boolean
  left: boolean
  right: boolean
  bottom: 'none' | 'bom' | 'cutlist'
  tab: InspectorTab
  /** «кисть» — клик по ячейке применяет этот тип заполнения */
  brush: CellFill | null
  presets: boolean
  help: boolean
  toast: { id: string; text: string; kind: 'info' | 'warn' | 'error' } | null
}

export interface AppState {
  project: Project
  view: ViewSettings
  snap: SnapSettings
  sel: Selection
  hoverUnit: string | null
  hoverCell: { unitId: string; key: CellKey } | null
  drag: DragState | null
  ui: UiState

  // — проект —
  newProject: () => void
  loadProject: (p: Project) => void
  setProjectName: (name: string) => void

  // — юниты —
  addUnit: (u?: Partial<ShelfUnit>) => string
  addPreset: (presetId: string, at?: Vec2) => string
  removeUnits: (ids: string[]) => void
  duplicateUnits: (ids: string[]) => string[]
  updateUnit: (id: string, fn: (u: ShelfUnit) => void) => void
  updateUnits: (ids: string[], fn: (u: ShelfUnit) => void) => void
  setUnitTransform: (id: string, pos: Vec2, rotY: number, elevation?: number) => void
  commitTransforms: (t: Record<string, TransformPatch>) => void
  /** программно поставить юнит на другой: по центру и на его крышку */
  stackOn: (unitId: string, targetId: string) => void

  // — ячейки —
  setCellFill: (unitId: string, key: CellKey, fill: CellFill) => void
  patchCell: (unitId: string, key: CellKey, patch: Partial<import('@/domain/types').Cell>) => void
  mergeCells: (unitId: string, a: CellKey, b: CellKey) => void
  splitCell: (unitId: string, key: CellKey) => void

  // — комната —
  updateRoom: (patch: Partial<Room>) => void

  // — выбор —
  select: (ids: string[], additive?: boolean) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  selectCell: (unitId: string, key: CellKey | null) => void
  setHoverUnit: (id: string | null) => void
  setHoverCell: (v: { unitId: string; key: CellKey } | null) => void

  // — вид / привязки / UI —
  setView: (patch: Partial<ViewSettings>) => void
  setSnap: (patch: Partial<SnapSettings>) => void
  setUi: (patch: Partial<UiState>) => void
  toast: (text: string, kind?: 'info' | 'warn' | 'error') => void

  // — драг —
  beginDrag: (unitIds: string[], mode?: 'move' | 'rotate') => void
  updateDrag: (
    live: Record<string, UnitTransform>,
    candidate: SnapCandidate | null,
    colliding: string[],
  ) => void
  endDrag: (commit: boolean) => void
}

// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_UI: UiState = {
  audience: 'client',
  lead: false,
  left: true,
  right: true,
  bottom: 'none',
  tab: 'frame',
  brush: null,
  presets: false,
  help: false,
  toast: null,
}

function touch(p: Project) {
  p.updatedAt = Date.now()
}

/**
 * Запись высоты установки. Ноль СТИРАЕТ поле, а не пишет нолик: юнит на полу —
 * это обычный юнит, и проект (а с ним и ссылка) не должен обрастать elevation: 0.
 */
function writeElevation(u: ShelfUnit, value: number) {
  const e = Number.isFinite(value) ? Math.max(0, Math.min(value, MAX_ELEVATION)) : 0
  if (e > 0) u.elevation = e
  else delete u.elevation
}

/** Ищет свободное место справа от самого правого юнита */
function nextFreeSpot(units: ShelfUnit[], size: { x: number; z: number }): Vec2 {
  if (units.length === 0) return { x: 0, z: 0 }
  let maxX = -Infinity
  let zAt = 0
  for (const u of units) {
    const bb = footprintAABB(u)
    if (bb.maxX > maxX) {
      maxX = bb.maxX
      zAt = (bb.minZ + bb.maxZ) / 2
    }
  }
  return { x: maxX + size.x / 2 + 120, z: zAt }
}

export const useAppStore = create<AppState>()(
  temporal(
    immer<AppState>((set, get) => ({
      project: makeProject(),
      view: { ...DEFAULT_VIEW },
      snap: { ...DEFAULT_SNAP },
      sel: { units: [], cell: null },
      hoverUnit: null,
      hoverCell: null,
      drag: null,
      ui: { ...DEFAULT_UI },

      // ── проект ──
      newProject: () =>
        set((s) => {
          s.project = makeProject()
          s.sel = { units: [], cell: null }
          s.drag = null
        }),

      loadProject: (p) =>
        set((s) => {
          s.project = p
          s.sel = { units: [], cell: null }
          s.drag = null
        }),

      setProjectName: (name) =>
        set((s) => {
          s.project.name = name
          touch(s.project)
        }),

      // ── юниты ──
      addUnit: (partial) => {
        const u = makeUnit(partial)
        if (!partial?.pos) u.pos = nextFreeSpot(get().project.units, outerSize(u.frame))
        set((s) => {
          s.project.units.push(u)
          s.sel = { units: [u.id], cell: null }
          touch(s.project)
        })
        return u.id
      },

      addPreset: (presetId, at) => {
        const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]
        const u = preset.make()
        u.pos = at ?? nextFreeSpot(get().project.units, outerSize(u.frame))
        set((s) => {
          s.project.units.push(u)
          s.sel = { units: [u.id], cell: null }
          touch(s.project)
        })
        return u.id
      },

      removeUnits: (ids) =>
        set((s) => {
          const kill = new Set(ids)
          s.project.units = s.project.units.filter((u) => !kill.has(u.id))
          s.sel.units = s.sel.units.filter((id) => !kill.has(id))
          if (s.sel.cell && kill.has(s.sel.cell.unitId)) s.sel.cell = null
          touch(s.project)
        }),

      duplicateUnits: (ids) => {
        const src = get().project.units.filter((u) => ids.includes(u.id))
        const clones = src.map((u) => {
          const c: ShelfUnit = JSON.parse(JSON.stringify(u))
          c.id = uid('unit')
          c.name = `${u.name} копия`
          c.pos = { x: u.pos.x + outerSize(u.frame).x + 100, z: u.pos.z }
          c.groupId = undefined
          return c
        })
        set((s) => {
          s.project.units.push(...clones)
          s.sel = { units: clones.map((c) => c.id), cell: null }
          touch(s.project)
        })
        return clones.map((c) => c.id)
      },

      updateUnit: (id, fn) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === id)
          if (!u || u.locked) return
          fn(u)
          E.normalizeCells(u)
          touch(s.project)
        }),

      updateUnits: (ids, fn) =>
        set((s) => {
          for (const u of s.project.units) {
            if (!ids.includes(u.id) || u.locked) continue
            fn(u)
            E.normalizeCells(u)
          }
          touch(s.project)
        }),

      setUnitTransform: (id, pos, rotY, elevation) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === id)
          if (!u) return
          u.pos = pos
          u.rotY = rotY
          if (elevation !== undefined) writeElevation(u, elevation)
          touch(s.project)
        }),

      commitTransforms: (t) =>
        set((s) => {
          for (const u of s.project.units) {
            const next = t[u.id]
            if (!next) continue
            u.pos = { ...next.pos }
            u.rotY = next.rotY
            if (next.elevation !== undefined) writeElevation(u, next.elevation)
          }
          touch(s.project)
        }),

      stackOn: (unitId, targetId) =>
        set((s) => {
          if (unitId === targetId) return
          const u = s.project.units.find((x) => x.id === unitId)
          const target = s.project.units.find((x) => x.id === targetId)
          if (!u || !target || u.locked) return
          // ставим по центру нижнего: единственное выравнивание, которое
          // гарантированно устойчиво при любом соотношении габаритов
          u.pos = { ...target.pos }
          writeElevation(u, unitTopY(target))
          touch(s.project)
        }),

      // ── ячейки ──
      setCellFill: (unitId, key, fill) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === unitId)
          if (!u || u.locked) return
          E.setCellFill(u, key, fill)
          touch(s.project)
        }),

      patchCell: (unitId, key, patch) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === unitId)
          if (!u || u.locked) return
          E.patchCell(u, key, patch)
          E.normalizeCells(u)
          touch(s.project)
        }),

      mergeCells: (unitId, a, b) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === unitId)
          if (!u || u.locked) return
          E.mergeCells(u, a, b)
          touch(s.project)
        }),

      splitCell: (unitId, key) =>
        set((s) => {
          const u = s.project.units.find((x) => x.id === unitId)
          if (!u || u.locked) return
          E.splitCell(u, key)
          touch(s.project)
        }),

      // ── комната ──
      updateRoom: (patch) =>
        set((s) => {
          Object.assign(s.project.room, patch)
          touch(s.project)
        }),

      // ── выбор ──
      select: (ids, additive) =>
        set((s) => {
          s.sel.units = additive ? [...new Set([...s.sel.units, ...ids])] : ids
          if (!ids.length) s.sel.cell = null
          else if (s.sel.cell && !s.sel.units.includes(s.sel.cell.unitId)) s.sel.cell = null
        }),

      toggleSelect: (id) =>
        set((s) => {
          s.sel.units = s.sel.units.includes(id)
            ? s.sel.units.filter((x) => x !== id)
            : [...s.sel.units, id]
        }),

      selectAll: () =>
        set((s) => {
          s.sel.units = s.project.units.filter((u) => !u.hidden).map((u) => u.id)
        }),

      clearSelection: () =>
        set((s) => {
          s.sel = { units: [], cell: null }
        }),

      selectCell: (unitId, key) =>
        set((s) => {
          s.sel.cell = key ? { unitId, key } : null
          if (key && !s.sel.units.includes(unitId)) s.sel.units = [unitId]
          if (key) s.ui.tab = 'cells'
        }),

      setHoverUnit: (id) =>
        set((s) => {
          s.hoverUnit = id
        }),

      setHoverCell: (v) =>
        set((s) => {
          s.hoverCell = v
        }),

      // ── вид ──
      setView: (patch) =>
        set((s) => {
          Object.assign(s.view, patch)
        }),

      setSnap: (patch) =>
        set((s) => {
          Object.assign(s.snap, patch)
        }),

      setUi: (patch) =>
        set((s) => {
          Object.assign(s.ui, patch)
        }),

      toast: (text, kind = 'info') =>
        set((s) => {
          s.ui.toast = { id: uid('t'), text, kind }
        }),

      // ── драг ──
      beginDrag: (unitIds, mode = 'move') =>
        set((s) => {
          const live: DragState['live'] = {}
          for (const u of s.project.units) {
            if (unitIds.includes(u.id))
              live[u.id] = { pos: { ...u.pos }, rotY: u.rotY, elevation: elevationOf(u) }
          }
          s.drag = { unitIds, mode, live, candidate: null, colliding: [] }
        }),

      updateDrag: (live, candidate, colliding) =>
        set((s) => {
          if (!s.drag) return
          s.drag.live = live
          s.drag.candidate = candidate
          s.drag.colliding = colliding
        }),

      endDrag: (commit) => {
        const d = get().drag
        set((s) => {
          s.drag = null
        })
        if (commit && d) get().commitTransforms(d.live)
      },
    })),
    {
      limit: 120,
      partialize: (state) => ({ project: state.project }) as unknown as AppState,
      equality: (a, b) => (a as AppState).project === (b as AppState).project,
      handleSet: (handleSet) => {
        let last = 0
        let timer: ReturnType<typeof setTimeout> | null = null
        let pending: Parameters<typeof handleSet>[0] | null = null
        return (state) => {
          const now = Date.now()
          if (now - last > 420) {
            last = now
            handleSet(state)
            return
          }
          pending = state
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            if (pending) {
              last = Date.now()
              handleSet(pending)
              pending = null
            }
          }, 420)
        }
      },
    },
  ),
)

// ────────────────────────────────────────────────────────────────────────────
//  История
// ────────────────────────────────────────────────────────────────────────────

type TemporalStore = typeof useAppStore.temporal

export function useTemporal<T>(selector: (s: ReturnType<TemporalStore['getState']>) => T): T {
  return useVanillaStore(useAppStore.temporal, selector)
}

export const undo = () => useAppStore.temporal.getState().undo()
export const redo = () => useAppStore.temporal.getState().redo()
export const clearHistory = () => useAppStore.temporal.getState().clear()

// ────────────────────────────────────────────────────────────────────────────
//  Удобные селекторы
// ────────────────────────────────────────────────────────────────────────────

export const useUnits = () => useAppStore((s) => s.project.units)
export const useRoom = () => useAppStore((s) => s.project.room)
export const useView = () => useAppStore((s) => s.view)
export const useSnap = () => useAppStore((s) => s.snap)
export const useUi = () => useAppStore((s) => s.ui)
export const useSelection = () => useAppStore((s) => s.sel)

export function useUnit(id: string | undefined): ShelfUnit | undefined {
  return useAppStore((s) => (id ? s.project.units.find((u) => u.id === id) : undefined))
}

/** Первый выбранный юнит — цель инспектора */
export function useActiveUnit(): ShelfUnit | undefined {
  return useAppStore((s) => s.project.units.find((u) => u.id === s.sel.units[0]))
}

const ZERO_TRANSFORM: UnitTransform = Object.freeze({
  pos: Object.freeze({ x: 0, z: 0 }),
  rotY: 0,
  elevation: 0,
}) as UnitTransform

/**
 * Эффективный трансформ юнита: во время драга берётся live-позиция,
 * иначе — из проекта. Используется и сценой, и планом.
 *
 * ВАЖНО: селектор собирает новый литерал, поэтому обязателен useShallow —
 * иначе zustand v5 (useSyncExternalStore) уходит в «getSnapshot should be cached»
 * и бесконечный ререндер. Ссылки внутри (pos) стабильны благодаря immer,
 * так что поверхностного сравнения достаточно.
 */
export function useUnitTransform(id: string): UnitTransform {
  return useAppStore(
    useShallow((s: AppState) => {
      const live = s.drag?.live[id]
      if (live) return live
      const u = s.project.units.find((x) => x.id === id)
      return u ? { pos: u.pos, rotY: u.rotY, elevation: elevationOf(u) } : ZERO_TRANSFORM
    }),
  )
}

/** Немедленный доступ вне React */
export const appState = () => useAppStore.getState()
