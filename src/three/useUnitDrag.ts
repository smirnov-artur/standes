/**
 * Перетаскивание юнитов мышью — сердце «магнитиков».
 *
 * Пайплайн одного кадра:
 *   pointermove → луч в горизонтальную плоскость драга → мировая точка (мм)
 *   → сырая позиция primary → solveSnap → applySnap → findCollisions
 *   → результат копится в ref и коммитится в стор РОВНО раз за кадр (useFrame).
 *
 * Плоскость драга проходит НЕ обязательно по полу: она берётся на высоте юнита
 * в момент захвата, иначе поднятый на башню юнит убегал бы от курсора.
 * Высоту задаёт решатель: кандидат 'stack' поднимает юнит на крышку соседа,
 * остальные кандидаты несут текущий этаж. Без привязок работает гравитация
 * (supportedElevation): юнит, под которым не осталось опоры, падает на пол —
 * стащенный с башни стеллаж не висит в воздухе.
 *
 * Хит-тест: невидимые боксы габарита живут на отдельном слое HIT_LAYER.
 * Камера этот слой не рендерит (нет лишних draw call), а событийный рейкастер
 * R3F работает на слое 0 и боксов не видит — клики по ячейкам не перехватываются.
 * Рейкастер здесь свой, со включённым HIT_LAYER.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { COLLIDE_TOL, findCollisions } from '@/domain/collision'
import { elevationOf } from '@/domain/frame'
import { applySnap, solveSnap, supportedElevation } from '@/domain/snapping'
import { MM, mm } from '@/domain/types'
import type { ShelfUnit, SnapCandidate, SnapSettings, Vec2 } from '@/domain/types'
import { appState } from '@/store/useStore'
import { sceneRegistry } from '@/three/registry'

/** Слой невидимых хит-боксов (камера и рейкастер R3F его игнорируют) */
export const HIT_LAYER = 2
/** До этого смещения курсора это ещё клик, а не перетаскивание */
const THRESHOLD_PX = 3

interface Transform {
  pos: Vec2
  rotY: number
  /** мм от пола до низа юнита */
  elevation: number
}

interface DragResult {
  live: Record<string, Transform>
  candidate: SnapCandidate | null
  colliding: string[]
}

interface Session {
  pointerId: number
  ids: string[]
  primaryId: string
  /** трансформы на момент захвата */
  start: Record<string, Transform>
  /** точка захвата на плоскости драга, мм */
  grab: Vec2
  /** высота плоскости драга, мм — высота primary в момент захвата */
  planeY: number
  /** текущие высоты перетаскиваемых, мм: их видит решатель на следующем кадре */
  elev: Record<string, number>
  px: number
  py: number
  /** порог пройден, beginDrag сделан */
  active: boolean
  /** контролы, которые мы выключили, и их прежнее состояние */
  parked: { obj: { enabled: boolean }; was: boolean }[]
}

export interface UnitDragApi {
  /** DragLayer вешает сюда группу с хит-боксами */
  hitRef: RefObject<THREE.Group | null>
}

// ── контролы камеры ─────────────────────────────────────────────────────────

function asToggleable(o: unknown): { enabled: boolean } | null {
  if (o && typeof o === 'object' && 'enabled' in o) return o as { enabled: boolean }
  return null
}

// ────────────────────────────────────────────────────────────────────────────

export function useUnitDrag(): UnitDragApi {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const invalidate = useThree((s) => s.invalidate)

  const hitRef = useRef<THREE.Group | null>(null)
  const sessionRef = useRef<Session | null>(null)
  /** клик по фону: ждём pointerup без движения, чтобы снять выделение */
  const bgRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRef = useRef<DragResult | null>(null)

  // векторный «инструментарий» — ноль аллокаций на событие
  const kit = useMemo(() => {
    const ray = new THREE.Raycaster()
    ray.layers.set(HIT_LAYER)
    return {
      ray,
      ndc: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      point: new THREE.Vector3(),
    }
  }, [])

  /** Экранные координаты → NDC */
  const toNdc = useCallback(
    (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      kit.ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      )
    },
    [gl, kit],
  )

  /**
   * Точка курсора на горизонтальной плоскости высоты elevMm (мм), результат в мм.
   * null — луч параллелен плоскости.
   * THREE.Plane задан уравнением normal·p + constant = 0, поэтому для плоскости
   * y = h константа равна -h (в метрах сцены). При elevMm = 0 это ровно пол.
   */
  const planePoint = useCallback(
    (ev: PointerEvent, elevMm: number): Vec2 | null => {
      toNdc(ev)
      kit.ray.setFromCamera(kit.ndc, camera)
      kit.plane.constant = -mm(elevMm)
      const p = kit.ray.ray.intersectPlane(kit.plane, kit.point)
      if (!p) return null
      return { x: p.x / MM, z: p.z / MM }
    },
    [camera, kit, toNdc],
  )

  /** id юнита под курсором; null — фон */
  const pick = useCallback(
    (ev: PointerEvent): string | null => {
      const g = hitRef.current
      if (!g) return null
      toNdc(ev)
      kit.ray.setFromCamera(kit.ndc, camera)
      const hits = kit.ray.intersectObjects(g.children, false)
      for (const h of hits) {
        const id: unknown = h.object.userData['unitId']
        if (typeof id === 'string') return id
        if (h.object.userData['background'] === true) return null
      }
      return null
    },
    [camera, kit, toNdc],
  )

  // ── расчёт кадра драга ────────────────────────────────────────────────────

  const compute = useCallback((s: Session, cursor: Vec2, alt: boolean, shift: boolean): DragResult => {
    const st = appState()
    const units = st.project.units
    const dragging = new Set(s.ids)
    const others = units.filter((u) => !dragging.has(u.id) && !u.hidden)

    const dx = cursor.x - s.grab.x
    const dz = cursor.z - s.grab.z

    // сырые (без привязок) положения всех перетаскиваемых.
    // Высота — ТЕКУЩАЯ (с прошлого кадра, изначально — из проекта): решателю она
    // нужна, чтобы понимать, стоит юнит на башне или уже съехал на пол.
    const raw: ShelfUnit[] = []
    for (const u of units) {
      const at = dragging.has(u.id) ? s.start[u.id] : undefined
      if (!at) continue
      raw.push({
        ...u,
        pos: { x: at.pos.x + dx, z: at.pos.z + dz },
        rotY: at.rotY,
        elevation: s.elev[u.id] ?? at.elevation,
      })
    }

    let candidate: SnapCandidate | null = null
    const primary = raw.find((u) => u.id === s.primaryId)
    // Alt — сырое движение без привязок (в том числе без штабеля);
    // Shift — временная привязка угла
    if (!alt && primary) {
      const settings: SnapSettings = shift ? { ...st.snap, angle: true } : st.snap
      candidate = solveSnap({ unit: primary, others, room: st.project.room, settings })
    }

    const live: Record<string, Transform> = {}
    if (candidate) {
      // Высоту кандидата считает решатель: 'stack' даёт крышку соседа, боковой
      // стык оставляет текущий этаж, а без опоры в новой точке — роняет на пол.
      Object.assign(live, applySnap(raw, s.primaryId, candidate))
    } else {
      /*
       * Без привязок (Alt или магнитить не к чему) высоту решает гравитация:
       * юнит, под которым не осталось опоры, падает на пол. Связка при этом
       * едет целиком — остальные получают ТОТ ЖЕ сдвиг по Y, что и primary,
       * иначе двухэтажная сцепка рассыпалась бы при Alt-перетаскивании.
       */
      const primaryElev = primary ? supportedElevation(primary, others) : 0
      const dElev = primary ? primaryElev - elevationOf(primary) : 0
      for (const u of raw) {
        live[u.id] = {
          pos: { ...u.pos },
          rotY: u.rotY,
          elevation:
            u.id === s.primaryId ? primaryElev : Math.max(0, elevationOf(u) + dElev),
        }
      }
    }

    // текущее состояние высот — вход решателя на следующем кадре
    for (const id of s.ids) {
      const t = live[id]
      if (t) s.elev[id] = t.elevation
    }

    // пересечения — и сам виновник, и партнёр, чтобы подсветить обоих.
    // findCollisions трёхмерный: юнит, поставленный СВЕРХУ, с нижним не пересекается.
    const bad = new Set<string>()
    for (const u of raw) {
      const t = live[u.id]
      if (!t) continue
      const hits = findCollisions(
        { ...u, pos: t.pos, rotY: t.rotY, elevation: t.elevation },
        others,
        COLLIDE_TOL,
      )
      if (!hits.length) continue
      bad.add(u.id)
      for (const h of hits) bad.add(h)
    }

    return { live, candidate, colliding: [...bad] }
  }, [])

  // ── коммит в стор не чаще раза в кадр ─────────────────────────────────────

  useFrame(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    if (appState().drag) appState().updateDrag(p.live, p.candidate, p.colliding)
  })

  // ── обработчики ───────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = gl.domElement

    const park = (s: Session) => {
      for (const c of [asToggleable(controls), asToggleable(sceneRegistry.controls)]) {
        if (c) s.parked.push({ obj: c, was: c.enabled })
      }
      for (const p of s.parked) p.obj.enabled = false
    }

    const unpark = (s: Session) => {
      for (const p of s.parked) p.obj.enabled = p.was
      s.parked.length = 0
    }

    const stop = (s: Session, commit: boolean) => {
      sessionRef.current = null
      pendingRef.current = null
      unpark(s)
      canvas.style.cursor = ''
      if (!s.active) return
      const st = appState()
      if (st.drag) st.endDrag(commit)
      invalidate()
    }

    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || sessionRef.current) return
      const id = pick(ev)
      const st = appState()

      if (!id) {
        bgRef.current = { x: ev.clientX, y: ev.clientY }
        return
      }
      bgRef.current = null

      const unit = st.project.units.find((u) => u.id === id)
      if (!unit || unit.hidden || unit.locked) return

      // выбор
      const additive = ev.ctrlKey || ev.metaKey
      if (additive) {
        st.toggleSelect(id)
        if (!appState().sel.units.includes(id)) return
      } else if (!st.sel.units.includes(id)) {
        st.select([id])
      }

      // что именно тащим: всю выборку или один юнит
      const sel = appState().sel.units
      const group = sel.length > 1 && sel.includes(id) ? sel : [id]
      const byId = new Map(appState().project.units.map((u) => [u.id, u]))
      const ids = group.filter((x) => {
        const u = byId.get(x)
        return !!u && !u.hidden && !u.locked
      })
      if (!ids.includes(id)) ids.push(id)

      // плоскость драга — на высоте захваченного юнита: поднятый юнит
      // должен ехать под курсором, а не под своей проекцией на пол
      const planeY = elevationOf(unit)
      const cursor = planePoint(ev, planeY)
      if (!cursor) return

      const start: Record<string, Transform> = {}
      const elev: Record<string, number> = {}
      for (const x of ids) {
        const u = byId.get(x)
        if (!u) continue
        start[x] = { pos: { ...u.pos }, rotY: u.rotY, elevation: elevationOf(u) }
        elev[x] = start[x].elevation
      }

      const s: Session = {
        pointerId: ev.pointerId,
        ids,
        primaryId: id,
        start,
        grab: cursor,
        planeY,
        elev,
        px: ev.clientX,
        py: ev.clientY,
        active: false,
        parked: [],
      }
      sessionRef.current = s
      // орбита не должна крутиться от клика по юниту — глушим сразу
      park(s)
    }

    const onMove = (ev: PointerEvent) => {
      const s = sessionRef.current
      if (!s || ev.pointerId !== s.pointerId) return

      if (!s.active) {
        if (Math.hypot(ev.clientX - s.px, ev.clientY - s.py) < THRESHOLD_PX) return
        s.active = true
        appState().beginDrag(s.ids, 'move')
        canvas.style.cursor = 'grabbing'
      }

      const cursor = planePoint(ev, s.planeY)
      if (!cursor) return
      pendingRef.current = compute(s, cursor, ev.altKey, ev.shiftKey)
      invalidate()
    }

    const onUp = (ev: PointerEvent) => {
      // клик по пустому месту — снять выделение
      const bg = bgRef.current
      if (bg) {
        bgRef.current = null
        if (Math.hypot(ev.clientX - bg.x, ev.clientY - bg.y) < THRESHOLD_PX) {
          appState().clearSelection()
        }
      }

      const s = sessionRef.current
      if (!s || ev.pointerId !== s.pointerId) return

      if (!s.active) {
        stop(s, false) // это был клик, драг не начинался
        return
      }

      // добираем последний накопленный кадр, чтобы коммит был точным
      const p = pendingRef.current
      pendingRef.current = null
      const st = appState()
      if (p && st.drag) st.updateDrag(p.live, p.candidate, p.colliding)

      const d = appState().drag
      const blocked = !!d && d.colliding.length > 0 && appState().snap.collide
      stop(s, !blocked)
      if (blocked) appState().toast('Пересечение — отменено', 'warn')
    }

    const onCancel = (ev: PointerEvent) => {
      const s = sessionRef.current
      if (!s || ev.pointerId !== s.pointerId) return
      stop(s, false)
    }

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      const s = sessionRef.current
      if (!s) return
      ev.preventDefault()
      stop(s, false)
    }

    const onBlur = () => {
      const s = sessionRef.current
      if (s) stop(s, false)
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)

    return () => {
      const s = sessionRef.current
      if (s) stop(s, false)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl, controls, invalidate, pick, planePoint, compute])

  return { hitRef }
}
