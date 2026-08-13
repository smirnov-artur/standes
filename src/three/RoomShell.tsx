/**
 * Оболочка комнаты: пол, «земля» вокруг, стены, плинтус, потолок.
 *
 * Ничего отсюда не попадает в экспорт GLB — RoomShell рендерится СНАРУЖИ
 * sceneRegistry.content, поэтому в GLB уходят только стеллажи.
 *
 * Стены — односторонние полотна, повёрнутые нормалью внутрь комнаты, на
 * внутренних поверхностях ±width/2 и ±depth/2. Толщина стены отыгрывается
 * верхней «отбивкой» — срезом по wallThickness, как на архитектурном разрезе.
 *
 * Глубина работает честно: непрозрачная стена пишет z-буфер, поэтому стеллаж
 * перед ней виден, а за ней — закрыт. Но комнату теперь можно сжать мышью, и
 * тогда мебель оказывается СНАРУЖИ: закрывать её стеной — значит потерять её
 * из виду в тот самый момент, когда человек должен её увидеть и переставить.
 * Стена, за которую вылез юнит, становится полупрозрачной (см. spill).
 */

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

import { footprintAABB } from '@/domain/frame'
import { mm } from '@/domain/types'
import { GroundGrid } from '@/three/GroundGrid'
import { PlanOverlay } from '@/three/PlanOverlay'
import { useThreeMaterial } from '@/three/materials'
import { useAppStore, useRoom, useUnits } from '@/store/useStore'

/** Значение CSS-переменной темы; пустая строка → запасной цвет */
function themeVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.length > 0 ? v : fallback
}

const NO_RAYCAST = () => null

/** толщина плинтуса, м */
const SKIRT_T = 0.018
/** высота верхней отбивки стены, м */
const CAP_H = 0.02
/** «земля» за пределами комнаты */
const OUTSIDE = 60
/** насколько юнит должен вылезти за стену, чтобы это считалось выходом, мм */
const SPILL_TOL = 5
/** непрозрачность стены, за которую вылезла мебель */
const SPILL_OPACITY = 0.22
/**
 * «Земля» лежит заметно ниже пола: между ними живёт наружная сетка
 * (GroundGrid, y = -0.003). Внутри комнаты пол перекрывает её по глубине —
 * так сетка делится на «внутри» и «снаружи» без единой лишней строчки шейдера.
 */
const Y_OUTSIDE = -0.008

// ────────────────────────────────────────────────────────────────────────────
//  Стена
// ────────────────────────────────────────────────────────────────────────────

type WallId = 'back' | 'front' | 'left' | 'right'
/** за какими стенами стоит мебель */
type Spill = Record<WallId, boolean>

interface WallDef {
  id: WallId
  /** центр полотна в мире, м (по высоте — середина стены) */
  pos: [number, number, number]
  /** поворот вокруг Y: локальный +Z смотрит ВНУТРЬ комнаты */
  rotY: number
  /** длина полотна, м */
  len: number
  /** длина верхней отбивки, м (углы стыкуются без нахлёста) */
  capLen: number
  /** внешняя нормаль в мире (XZ) */
  nx: number
  nz: number
}

/**
 * Поверхность стены. В «Плане» — чертёж, а не фотография: материал плоский,
 * без бликов и теней, поэтому стены не спорят с линиями PlanOverlay.
 */
function Surface({
  flat,
  color,
  roughness,
  side,
}: {
  flat: boolean
  color: THREE.ColorRepresentation
  roughness: number
  side?: THREE.Side
}) {
  if (flat) {
    return <meshBasicMaterial color={color} side={side} transparent depthWrite={false} />
  }
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={0}
      side={side}
      transparent
      depthWrite={false}
    />
  )
}

interface WallProps {
  def: WallDef
  height: number
  thickness: number
  skirting: number
  color: string
  skirtColor: THREE.Color
  capColor: THREE.Color
  /** 'auto' — прячем стены, обращённые к камере */
  auto: boolean
  /** режим «План»: плоская заливка без освещения */
  flat: boolean
  /** за этой стеной стоит мебель — не закрываем её собой */
  spill: boolean
}

function Wall({
  def,
  height,
  thickness,
  skirting,
  color,
  skirtColor,
  capColor,
  auto,
  flat,
  spill,
}: WallProps) {
  const grp = useRef<THREE.Group>(null)
  const opacity = useRef(1)
  const hidden = useRef(false)
  const first = useRef(true)
  const invalidate = useThree((s) => s.invalidate)

  useFrame((state, delta) => {
    const g = grp.current
    if (!g) return

    if (auto) {
      const cam = state.camera.position
      const outward = (cam.x - def.pos[0]) * def.nx + (cam.z - def.pos[2]) * def.nz
      // гистерезис: у самой плоскости стена не должна мигать
      hidden.current = outward > (hidden.current ? -0.15 : 0.05)
    } else {
      hidden.current = false
    }

    const target = hidden.current ? 0 : spill ? SPILL_OPACITY : 1
    if (first.current) {
      // на первом кадре без анимации — иначе при загрузке мигает ближняя стена
      first.current = false
      opacity.current = target
    } else if (Math.abs(target - opacity.current) > 0.002) {
      opacity.current = THREE.MathUtils.damp(opacity.current, target, 7, delta)
      if (Math.abs(target - opacity.current) <= 0.002) opacity.current = target
      invalidate() // frameloop='demand': докручиваем анимацию до конца
    }

    const visible = opacity.current > 0.015
    g.visible = visible
    if (!visible) return
    // непрозрачная стена обязана писать глубину, иначе сквозь неё видно размеры
    const solid = opacity.current > 0.985
    for (const child of g.children) {
      const mat = (child as THREE.Mesh).material
      if (mat && !Array.isArray(mat)) {
        mat.opacity = opacity.current
        mat.depthWrite = solid
      }
    }
  })

  return (
    <group ref={grp} position={def.pos} rotation={[0, def.rotY, 0]}>
      {/* полотно: нормаль внутрь, но двусторонний рендер — режим 'all' читается как коробка */}
      <mesh receiveShadow={!flat} raycast={NO_RAYCAST}>
        <planeGeometry args={[def.len, height]} />
        <Surface flat={flat} color={color} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>

      {/* верхняя отбивка — срез стены по её толщине */}
      {thickness > 0.002 && (
        <mesh position={[0, height / 2 - CAP_H / 2, -thickness / 2 - 0.0006]} raycast={NO_RAYCAST}>
          <boxGeometry args={[def.capLen, CAP_H, thickness]} />
          <Surface flat={flat} color={capColor} roughness={0.95} />
        </mesh>
      )}

      {/* плинтус */}
      {skirting > 0.002 && (
        <mesh
          position={[0, -height / 2 + skirting / 2, SKIRT_T / 2 + 0.0006]}
          receiveShadow={!flat}
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[def.len, skirting, SKIRT_T]} />
          <Surface flat={flat} color={skirtColor} roughness={0.55} />
        </mesh>
      )}
    </group>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Комната
// ────────────────────────────────────────────────────────────────────────────

export function RoomShell() {
  const room = useRoom()
  const units = useUnits()
  const showRoom = useAppStore((s) => s.view.showRoom)
  const theme = useAppStore((s) => s.view.theme)
  const isPlan = useAppStore((s) => s.view.mode === 'plan')

  const W = mm(room.width)
  const D = mm(room.depth)
  const H = mm(room.height)
  const T = mm(room.wallThickness)
  const skirt = mm(room.skirting)

  // масштаб текстуры пола физически верный: размер детали = размер комнаты
  const floorMat = useThreeMaterial(room.floorMaterial, {
    size: { x: room.width, y: 10, z: room.depth },
  })

  // «земля» вокруг комнаты — между фоном и полом, чтобы горизонт не был пустым
  const outsideColor = useMemo(() => {
    const c = new THREE.Color(themeVar('--scene-bottom', '#0a0b0d'))
    return c.lerp(new THREE.Color(themeVar('--scene-top', '#171a1f')), 0.4)
  }, [theme])

  const skirtColor = useMemo(
    () => new THREE.Color(room.wallColor).lerp(new THREE.Color('#ffffff'), 0.12),
    [room.wallColor],
  )
  const capColor = useMemo(
    () => new THREE.Color(room.wallColor).multiplyScalar(0.78),
    [room.wallColor],
  )
  const ceilColor = useMemo(
    () => new THREE.Color(room.wallColor).lerp(new THREE.Color('#ffffff'), 0.3),
    [room.wallColor],
  )

  /**
   * Стены считаются по внутренним размерам, юниты живут в мм — сравниваем в мм.
   * Пересчёт идёт по коммитам (drag.live сюда не заходит): во время
   * перетаскивания стеллажа стены не должны мигать под курсором.
   */
  const spill = useMemo<Spill>(() => {
    const hw = room.width / 2 + SPILL_TOL
    const hd = room.depth / 2 + SPILL_TOL
    const out: Spill = { back: false, front: false, left: false, right: false }
    for (const u of units) {
      if (u.hidden) continue
      const bb = footprintAABB(u)
      if (bb.minX < -hw) out.left = true
      if (bb.maxX > hw) out.right = true
      if (bb.minZ < -hd) out.back = true
      if (bb.maxZ > hd) out.front = true
    }
    return out
  }, [units, room.width, room.depth])

  const walls = useMemo<WallDef[]>(
    () => [
      { id: 'back', pos: [0, H / 2, -D / 2], rotY: 0, len: W, capLen: W + 2 * T, nx: 0, nz: -1 },
      { id: 'front', pos: [0, H / 2, D / 2], rotY: Math.PI, len: W, capLen: W + 2 * T, nx: 0, nz: 1 },
      { id: 'left', pos: [-W / 2, H / 2, 0], rotY: Math.PI / 2, len: D, capLen: D, nx: -1, nz: 0 },
      { id: 'right', pos: [W / 2, H / 2, 0], rotY: -Math.PI / 2, len: D, capLen: D, nx: 1, nz: 0 },
    ],
    [W, D, H, T],
  )

  return (
    <group name="room-shell">
      <GroundGrid />
      <PlanOverlay />

      {/* земля вокруг комнаты */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_OUTSIDE, 0]} receiveShadow>
        <planeGeometry args={[OUTSIDE, OUTSIDE]} />
        <meshStandardMaterial color={outsideColor} roughness={1} metalness={0} />
      </mesh>

      {showRoom && (
        <>
          {/* пол */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floorMat}>
            <planeGeometry args={[W, D]} />
          </mesh>

          {room.walls !== 'none' &&
            walls.map((w) => (
              <Wall
                key={w.id}
                def={w}
                height={H}
                thickness={T}
                skirting={skirt}
                color={room.wallColor}
                skirtColor={skirtColor}
                capColor={capColor}
                auto={room.walls === 'auto'}
                flat={isPlan}
                spill={spill[w.id]}
              />
            ))}

          {/* потолок: нормалью вниз, сверху не мешает — задняя грань отсекается.
              В «Плане» его нет вовсе: чертёж смотрит на пол, а не на перекрытие */}
          {room.ceiling && !isPlan && (
            <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow raycast={NO_RAYCAST}>
              <planeGeometry args={[W, D]} />
              <meshStandardMaterial
                color={ceilColor}
                roughness={0.96}
                metalness={0}
                side={THREE.FrontSide}
              />
            </mesh>
          )}
        </>
      )}
    </group>
  )
}
