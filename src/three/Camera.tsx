/**
 * Камеры и контролы для трёх режимов вида.
 *
 *  '3d'    — перспектива + орбита (ЛКМ вращает, ПКМ панорамирует; на время
 *            драга стеллажа контролы выключаются, чтобы не воевать за ЛКМ)
 *  'plan'  — ортокамера строго сверху + MapControls (без вращения)
 *  'front' — ортокамера спереди + пан/зум
 *
 * Переключение режима и «фокус на выборе» — не прыжком, а анимацией в useFrame
 * прямой мутацией camera.position / controls.target (никакого setState в кадре).
 *
 * ЕДИНИЦЫ: сцена в МЕТРАХ, домен приходит в мм и переводится через mm().
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import { footprintAABB, outerSize } from '@/domain/frame'
import { mm } from '@/domain/types'
import type { ShelfUnit, ViewMode } from '@/domain/types'
import { FOCUS_EVENT, sceneRegistry } from '@/three/registry'
import { appState, useAppStore } from '@/store/useStore'

// ── стабильные ссылки: массивы-пропсы не должны меняться между рендерами ──
const POS_3D: [number, number, number] = [3.4, 2.6, 4.6]
const POS_PLAN: [number, number, number] = [0, 20, 0]
const ROT_PLAN: [number, number, number] = [-Math.PI / 2, 0, 0]
const POS_FRONT: [number, number, number] = [0, 1.2, 12]

/** ЛКМ занята выбором/драгом, поэтому пан вешаем ещё и на ПКМ */
const MB_ORBIT = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
const MB_PAN = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

const TARGET_3D = new THREE.Vector3(0, 0.8, 0)
const TRANSITION_MS = 450
/** какую долю кадра должен занимать объект при фокусе */
const FILL = 0.7
/** запас по краям кадра при посадке ортовида: 8 % */
const FIT_MARGIN = 1.08
/**
 * В «Плане» запас больше: по краям кадра живут ручки стен (PlanOverlay), и
 * они лежат СНАРУЖИ от внутренней грани. С запасом в 8 % их бы подрезало краем.
 */
const FIT_MARGIN_PLAN = 1.2
/** во сколько раз должна измениться комната, чтобы 3D-камера переподсела */
const ROOM_REFIT = 1.3
/** сколько кадра занимает комната при переподгонке 3D */
const ROOM_FILL = 0.82
/** дальше отходить некуда: столько же стоит в maxDistance орбиты */
const MAX_DIST = 90

/**
 * Пока пользователь тянет стену на плане, авто-посадка молчит.
 *
 * Иначе получается петля обратной связи: комната растёт → камера отъезжает →
 * та же точка экрана превращается в другую точку мира → стена «убегает»
 * от курсора. Флаг ставит PlanOverlay; отложенная посадка отрабатывает
 * в кадровом цикле сразу после того, как стену отпустили.
 */
export const roomResize = { active: false }

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

interface CamAnim {
  t0: number
  dur: number
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromZoom: number
  toZoom: number
}

type AnyCam = THREE.PerspectiveCamera | THREE.OrthographicCamera

const isOrtho = (c: AnyCam): c is THREE.OrthographicCamera =>
  (c as THREE.OrthographicCamera).isOrthographicCamera === true

/** Габаритный ящик набора юнитов в МЕТРАХ (пятно застройки + высота) */
function unitsBox(units: ShelfUnit[]): THREE.Box3 | null {
  const box = new THREE.Box3()
  let any = false
  const p = new THREE.Vector3()
  for (const u of units) {
    if (u.hidden) continue
    const bb = footprintAABB(u)
    const h = outerSize(u.frame).y
    box.expandByPoint(p.set(mm(bb.minX), 0, mm(bb.minZ)))
    box.expandByPoint(p.set(mm(bb.maxX), mm(h), mm(bb.maxZ)))
    any = true
  }
  return any ? box : null
}

/**
 * Полуразмеры ФАКТИЧЕСКОГО содержимого от начала координат, м:
 * комната плюс все видимые юниты.
 *
 * Ортокамеры смотрят строго в (0, *, 0), поэтому важен не размер габаритного
 * ящика, а то, НАСКОЛЬКО ДАЛЕКО он уходит от центра: юнит, выставленный за
 * стену, иначе обрежется краем кадра.
 */
function contentHalf(
  roomW: number,
  roomD: number,
  roomH: number,
  units: ShelfUnit[],
): { x: number; z: number; top: number } {
  let x = mm(roomW) / 2
  let z = mm(roomD) / 2
  let top = mm(roomH)
  for (const u of units) {
    if (u.hidden) continue
    const bb = footprintAABB(u)
    x = Math.max(x, mm(Math.abs(bb.minX)), mm(Math.abs(bb.maxX)))
    z = Math.max(z, mm(Math.abs(bb.minZ)), mm(Math.abs(bb.maxZ)))
    top = Math.max(top, mm(outerSize(u.frame).y))
  }
  return { x, z, top }
}

// ────────────────────────────────────────────────────────────────────────────

export function CameraRig() {
  const mode = useAppStore((s) => s.view.mode)
  const dragging = useAppStore((s) => s.drag !== null)
  const roomW = useAppStore((s) => s.project.room.width)
  const roomD = useAppStore((s) => s.project.room.depth)
  const roomH = useAppStore((s) => s.project.room.height)
  const size = useThree((s) => s.size)

  const camRef = useRef<AnyCam | null>(null)
  const ctlRef = useRef<OrbitControlsImpl | null>(null)
  const anim = useRef<CamAnim | null>(null)
  /** откуда «улетаем» при следующей смене режима */
  const carry = useRef({ pos: new THREE.Vector3(...POS_3D), target: TARGET_3D.clone() })
  /** режим, который ещё нужно применить (ждём, пока контролы привяжутся к камере) */
  const pending = useRef<ViewMode | null>(mode)
  const prevSize = useRef({ w: size.width, h: size.height })

  /**
   * Текущие размеры кадра и комнаты — читаются из колбэков, у которых не должно
   * быть зависимостей (ref-колбэк камеры пересоздавать нельзя: R3F на смену
   * идентичности сначала отвяжет камеру, а это моргание сцены на каждый ресайз).
   */
  const env = useRef({ w: size.width, h: size.height, roomW, roomD, roomH, mode })
  env.current = { w: size.width, h: size.height, roomW, roomD, roomH, mode }

  /**
   * Zoom ортокамеры. drei строит фрустум в ПИКСЕЛЯХ (left = -w/2 …),
   * поэтому zoom = «пикселей на метр»: ширина кадра в метрах = w / zoom.
   *
   * Считаем по фактическому содержимому (комната + юниты), а не по одной
   * комнате: иначе стеллаж, выехавший за стену, обрежется, а сам план
   * болтается в половине кадра.
   */
  const fitZoom = useCallback((m: ViewMode) => {
    const e = env.current
    const h = contentHalf(e.roomW, e.roomD, e.roomH, appState().project.units)
    const width = Math.max(0.5, h.x * 2)
    if (m === 'plan') {
      return Math.min(e.w / width, e.h / Math.max(0.5, h.z * 2)) / FIT_MARGIN_PLAN
    }
    // 'front': камера смотрит на высоту POS_FRONT[1], значит по вертикали важен
    // максимальный отход от неё — и вниз до пола, и вверх до потолка
    const halfV = Math.max(0.25, POS_FRONT[1], h.top - POS_FRONT[1])
    return Math.min(e.w / width, e.h / (halfV * 2)) / FIT_MARGIN
  }, [])

  const setCam = useCallback(
    (c: AnyCam | null) => {
      camRef.current = c
      if (!c) return
      sceneRegistry.camera = c
      // Ортокамера drei рождается с zoom = 1. В метровой сцене это кадр шириной
      // в СОТНИ метров: комната схлопывается в точку — визуально чёрный экран.
      // applyMode поправит масштаб, но только когда контролы привяжутся к новой
      // камере, а это отдельный кадр. Поэтому задаём масштаб прямо здесь.
      if (isOrtho(c)) {
        c.zoom = fitZoom(env.current.mode)
        c.updateProjectionMatrix()
      }
    },
    [fitZoom],
  )

  const setCtl = useCallback((c: OrbitControlsImpl | null) => {
    ctlRef.current = c
    sceneRegistry.controls = c
  }, [])

  /**
   * Пользователь сам покрутил вид — авто-посадка больше не навязывается:
   * подгонять zoom под содержимое, когда человек уже приблизил деталь,
   * значит вырывать у него камеру из рук.
   */
  const userAdjusted = useRef(false)

  const onControlStart = useCallback(() => {
    anim.current = null
    userAdjusted.current = true
  }, [])

  const startAnim = useCallback(
    (toPos: THREE.Vector3, toTarget: THREE.Vector3, toZoom: number, dur = TRANSITION_MS) => {
      const cam = camRef.current
      if (!cam) return
      const ctl = ctlRef.current
      anim.current = {
        t0: performance.now(),
        dur,
        fromPos: cam.position.clone(),
        toPos: toPos.clone(),
        fromTarget: (ctl ? ctl.target : carry.current.target).clone(),
        toTarget: toTarget.clone(),
        fromZoom: cam.zoom,
        toZoom,
      }
    },
    [],
  )

  /**
   * ── переподгонка под изменившееся содержимое ──
   * Ортовиды: пересчитываем zoom (кадр задан в пикселях, метры в него не
   * «влезают» сами). Перспектива: см. fit3d.
   */
  const refit = useCallback(
    (dur: number) => {
      const cam = camRef.current
      if (!cam || !isOrtho(cam) || pending.current) return
      const ctl = ctlRef.current
      startAnim(
        cam.position.clone(),
        (ctl ? ctl.target : new THREE.Vector3()).clone(),
        fitZoom(env.current.mode),
        dur,
      )
    },
    [fitZoom, startAnim],
  )

  /**
   * Отвести перспективную камеру так, чтобы комната снова помещалась в кадр.
   *
   * Направление взгляда сохраняем — человек уже выбрал, откуда смотрит; меняем
   * только дистанцию и цель. Считаем по описанной сфере содержимого: она чуть
   * щедрее прямоугольника, зато не зависит от ракурса и гарантированно влезает.
   */
  const fit3d = useCallback(
    (dur: number) => {
      const cam = camRef.current
      if (!cam || isOrtho(cam) || pending.current) return
      const e = env.current
      const h = contentHalf(e.roomW, e.roomD, e.roomH, appState().project.units)
      const center = new THREE.Vector3(0, h.top / 2, 0)
      const radius = Math.max(0.5, Math.hypot(h.x, h.z, h.top / 2))
      const halfV = Math.tan((cam.fov * Math.PI) / 360)
      const halfH = halfV * cam.aspect
      const dist = Math.min(
        MAX_DIST,
        Math.max(radius / (ROOM_FILL * halfV), radius / (ROOM_FILL * halfH)),
      )
      const ctl = ctlRef.current
      const dir = new THREE.Vector3().subVectors(cam.position, ctl ? ctl.target : center)
      if (dir.lengthSq() < 1e-6) dir.set(...POS_3D)
      dir.normalize()
      startAnim(center.clone().addScaledVector(dir, dist), center, 1, dur)
    },
    [startAnim],
  )

  /** размеры комнаты, под которые камера садилась в прошлый раз */
  const fitRoom = useRef({ w: roomW, d: roomD })
  /** посадка, отложенная на время перетаскивания стены */
  const refitOwed = useRef(false)

  const applyRoomFit = useCallback(
    (dur: number) => {
      const e = env.current
      if (e.mode !== '3d') {
        // в ортовидах кадр обязан держать комнату целиком, и это дёшево
        fitRoom.current = { w: e.roomW, d: e.roomD }
        refit(dur)
        return
      }
      // в 3D камера не дёргается на мелкие правки: только когда комната
      // изменилась в разы и стеллажи иначе превратятся в точку
      const b = fitRoom.current
      const ratio = Math.max(
        e.roomW / Math.max(1, b.w),
        b.w / Math.max(1, e.roomW),
        e.roomD / Math.max(1, b.d),
        b.d / Math.max(1, e.roomD),
      )
      if (ratio < ROOM_REFIT) return
      fitRoom.current = { w: e.roomW, d: e.roomD }
      fit3d(dur)
    },
    [fit3d, refit],
  )

  // при смене режима помечаем, что новую камеру надо расставить
  useLayoutEffect(() => {
    pending.current = mode
    // новый режим — новая посадка: право авто-подгонки возвращается системе
    userAdjusted.current = false
    // applyMode уже поставил камеру под новый режим — начинаем отсчёт заново
    fitRoom.current = { w: env.current.roomW, d: env.current.roomD }
  }, [mode])

  /** Ставит камеру нового режима в стартовую точку и запускает перелёт */
  const applyMode = useCallback(
    (m: ViewMode, cam: AnyCam, ctl: OrbitControlsImpl) => {
      const cp = carry.current.pos
      const ct = carry.current.target
      let fromPos: THREE.Vector3
      let fromTarget: THREE.Vector3
      let fromZoom: number
      let toPos: THREE.Vector3
      let toTarget: THREE.Vector3
      let toZoom: number

      if (m === 'plan') {
        toZoom = fitZoom('plan')
        // «взлетаем» вверх из точки, над которой стояли, и отъезжаем до габарита комнаты
        toPos = new THREE.Vector3(0, POS_PLAN[1], 0)
        toTarget = new THREE.Vector3(0, 0, 0)
        fromPos = new THREE.Vector3(cp.x, POS_PLAN[1], cp.z)
        fromTarget = new THREE.Vector3(ct.x, 0, ct.z)
        fromZoom = toZoom * 1.7
      } else if (m === 'front') {
        toZoom = fitZoom('front')
        toPos = new THREE.Vector3(0, POS_FRONT[1], POS_FRONT[2])
        toTarget = new THREE.Vector3(0, POS_FRONT[1], 0)
        fromPos = new THREE.Vector3(cp.x, Math.max(0.2, cp.y), POS_FRONT[2])
        fromTarget = new THREE.Vector3(ct.x, Math.max(0.2, ct.y), 0)
        fromZoom = toZoom * 1.7
      } else {
        toZoom = 1
        toPos = new THREE.Vector3(...POS_3D)
        toTarget = TARGET_3D.clone()
        fromPos = cp.clone()
        fromTarget = ct.clone()
        fromZoom = 1
        // если пришли из ортопроекции сверху — не начинать полёт из вырожденной точки
        if (fromPos.distanceToSquared(fromTarget) < 0.04) fromPos.copy(toPos)
      }

      cam.position.copy(fromPos)
      ctl.target.copy(fromTarget)
      if (isOrtho(cam)) {
        cam.zoom = fromZoom
        cam.updateProjectionMatrix()
      }
      ctl.update()

      anim.current = { t0: performance.now(), dur: TRANSITION_MS, fromPos, toPos, fromTarget, toTarget, fromZoom, toZoom }
    },
    [fitZoom],
  )

  // ── единственный кадровый цикл камеры ──
  useFrame(() => {
    const cam = camRef.current
    const ctl = ctlRef.current
    if (!cam) return

    // контролы drei создаются от «камеры по умолчанию» на момент рендера,
    // поэтому после смены режима ждём кадр, где они уже привязаны к нашей камере
    if (pending.current && ctl && ctl.object === cam) {
      applyMode(pending.current, cam, ctl)
      pending.current = null
    }

    // стену отпустили — досаживаем камеру под новую комнату
    if (refitOwed.current && !roomResize.active) {
      refitOwed.current = false
      applyRoomFit(300)
    }

    const a = anim.current
    if (a) {
      const k = Math.min(1, (performance.now() - a.t0) / a.dur)
      const e = easeOutCubic(k)
      cam.position.lerpVectors(a.fromPos, a.toPos, e)
      if (ctl) ctl.target.lerpVectors(a.fromTarget, a.toTarget, e)
      if (isOrtho(cam)) {
        cam.zoom = a.fromZoom + (a.toZoom - a.fromZoom) * e
        cam.updateProjectionMatrix()
      }
      ctl?.update()
      if (k >= 1) anim.current = null
      return
    }

    // в покое запоминаем, откуда стартовать при следующей смене режима
    carry.current.pos.copy(cam.position)
    if (ctl) carry.current.target.copy(ctl.target)
  })

  /**
   * ── ресайз ──
   * Фрустум ортокамеры задан в ПИКСЕЛЯХ, поэтому кадр обязан пережить смену
   * размера канваса. Пока человек не трогал вид — просто пересаживаем камеру
   * под новое содержимое кадра; если трогал — масштабируем его же zoom, чтобы
   * не отнимать выбранное им приближение.
   */
  useEffect(() => {
    const prev = prevSize.current
    prevSize.current = { w: size.width, h: size.height }
    const cam = camRef.current
    if (!cam || !isOrtho(cam)) return
    if (prev.w === size.width && prev.h === size.height) return

    if (!userAdjusted.current) {
      const z = fitZoom(env.current.mode)
      cam.zoom = z
      cam.updateProjectionMatrix()
      if (anim.current) {
        const k = z / Math.max(1e-6, anim.current.toZoom)
        anim.current.fromZoom *= k
        anim.current.toZoom = z
      }
      return
    }

    const k = Math.min(size.width / Math.max(1, prev.w), size.height / Math.max(1, prev.h))
    cam.zoom *= k
    cam.updateProjectionMatrix()
    if (anim.current) {
      anim.current.fromZoom *= k
      anim.current.toZoom *= k
    }
  }, [size.width, size.height, fitZoom])

  /**
   * ── содержимое изменилось — переподогнать вид ──
   * Комната: пересаживаем всегда, изменение её размеров — это осознанная
   * смена сцены (в 3D — только при изменении в разы, см. applyRoomFit).
   * Юниты (добавили / удалили / подвинули): только пока человек не взял камеру
   * в свои руки, иначе каждый сдвиг полки дёргал бы кадр.
   */
  const units = useAppStore((s) => s.project.units)
  const unitSig = useMemo(
    () =>
      units
        .map((u) => {
          const o = outerSize(u.frame)
          return `${u.id}:${u.pos.x},${u.pos.z},${u.rotY},${o.x},${o.y},${o.z},${u.hidden ? 1 : 0}`
        })
        .join('|'),
    [units],
  )

  const prevRoom = useRef({ w: roomW, d: roomD, h: roomH })
  useEffect(() => {
    const p = prevRoom.current
    if (p.w === roomW && p.d === roomD && p.h === roomH) return
    prevRoom.current = { w: roomW, d: roomD, h: roomH }
    // стену тянут прямо сейчас — посадку откладываем до отпускания
    if (roomResize.active) {
      refitOwed.current = true
      return
    }
    applyRoomFit(300)
  }, [roomW, roomD, roomH, applyRoomFit])

  const prevUnitSig = useRef(unitSig)
  useEffect(() => {
    if (prevUnitSig.current === unitSig) return
    prevUnitSig.current = unitSig
    if (userAdjusted.current) return
    refit(280)
  }, [unitSig, refit])

  // ── фокус на выборе (или на всех) ──
  const focus = useCallback(() => {
    const cam = camRef.current
    if (!cam) return
    const st = appState()
    const sel = new Set(st.sel.units)
    const picked = sel.size ? st.project.units.filter((u) => sel.has(u.id)) : st.project.units
    const box = unitsBox(picked.length ? picked : st.project.units)
    if (!box) return

    const center = box.getCenter(new THREE.Vector3())
    const ext = box.getSize(new THREE.Vector3())

    if (isOrtho(cam)) {
      const vertical = mode === 'plan' ? ext.z : ext.y
      const zoom =
        Math.min(size.width / Math.max(0.2, ext.x), size.height / Math.max(0.2, vertical)) * FILL
      const toPos =
        mode === 'plan'
          ? new THREE.Vector3(center.x, POS_PLAN[1], center.z)
          : new THREE.Vector3(center.x, center.y, POS_FRONT[2])
      const toTarget =
        mode === 'plan'
          ? new THREE.Vector3(center.x, 0, center.z)
          : new THREE.Vector3(center.x, center.y, 0)
      startAnim(toPos, toTarget, zoom)
      return
    }

    // перспектива: дистанция, при которой описанная сфера занимает FILL кадра
    const radius = Math.max(0.25, ext.length() / 2)
    const halfV = Math.tan((cam.fov * Math.PI) / 360)
    const halfH = halfV * cam.aspect
    const dist = Math.max(radius / (FILL * halfV), radius / (FILL * halfH))
    const ctl = ctlRef.current
    const dir = new THREE.Vector3().subVectors(cam.position, ctl ? ctl.target : center)
    if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 0.9)
    dir.normalize()
    startAnim(center.clone().addScaledVector(dir, dist), center.clone(), 1)
  }, [mode, size.width, size.height, startAnim])

  useEffect(() => {
    window.addEventListener(FOCUS_EVENT, focus)
    return () => window.removeEventListener(FOCUS_EVENT, focus)
  }, [focus])

  useEffect(() => {
    return () => {
      sceneRegistry.controls = null
    }
  }, [])

  // ── ортокамеры: target выставляется императивно в applyMode, пропом не даём ──
  if (mode === 'plan') {
    return (
      <>
        <OrthographicCamera ref={setCam} makeDefault position={POS_PLAN} rotation={ROT_PLAN} near={0.1} far={100} />
        <MapControls
          ref={setCtl}
          makeDefault
          enabled={!dragging}
          enableRotate={false}
          enableDamping
          dampingFactor={0.12}
          minZoom={8}
          maxZoom={6000}
          mouseButtons={MB_PAN}
          onStart={onControlStart}
        />
      </>
    )
  }

  if (mode === 'front') {
    return (
      <>
        <OrthographicCamera ref={setCam} makeDefault position={POS_FRONT} near={0.1} far={100} />
        <OrbitControls
          ref={setCtl}
          makeDefault
          enabled={!dragging}
          enableRotate={false}
          enableDamping
          dampingFactor={0.12}
          screenSpacePanning
          minZoom={8}
          maxZoom={6000}
          mouseButtons={MB_PAN}
          onStart={onControlStart}
        />
      </>
    )
  }

  return (
    <>
      {/* far и maxDistance держат самый большой зал (30 м) целиком в кадре */}
      <PerspectiveCamera ref={setCam} makeDefault fov={38} near={0.05} far={400} position={POS_3D} />
      <OrbitControls
        ref={setCtl}
        makeDefault
        enabled={!dragging}
        enableDamping
        dampingFactor={0.07}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.8}
        maxDistance={MAX_DIST}
        mouseButtons={MB_ORBIT}
        onStart={onControlStart}
      />
    </>
  )
}
