/**
 * Пол-сетка сцены: адаптивный грид + оси X/Z.
 *
 * Живёт вне sceneRegistry.content — в экспорт GLB не попадает.
 *
 * ДВА ПРАВИЛА, из которых следует всё остальное:
 *
 *  1. Сетка НЕ равна шагу привязки. Шаг привязки — это поведение мыши, он
 *     показан в тулбаре. Если рисовать его линиями (50 мм по умолчанию),
 *     светлый бетонный пол превращается в кафель с затиркой, а в «Плане» —
 *     в сплошной серый шум. Поэтому шаг РИСОВАНИЯ выбирается по масштабу:
 *     ближайшее круглое из ряда 0.1 / 0.25 / 0.5 / 1 / 2 / 5 м так, чтобы
 *     ячейка на экране была примерно 24…70 px. Мажорная линия = минорная × 5.
 *
 *  2. Сетка — ПОДЛОЖКА, а не рисунок. Цвет берётся не из --grid-line «как
 *     есть», а от цвета пола, сдвинутого на несколько процентов по светлоте:
 *     внутри комнаты линии едва различимы, снаружи — чуть заметнее.
 *
 * СЛОИ ПО ВЫСОТЕ (м):
 *     -0.008  «земля» вокруг комнаты (RoomShell, непрозрачная)
 *     -0.003  наружная сетка — ниже пола, поэтому внутри комнаты её
 *             СЪЕДАЕТ depth-тест пола: две зоны без единого шейдера
 *      0.000  пол комнаты
 *      0.0015 внутренняя сетка (подъём 1.5 мм от пола)
 *      0.0016 оси X/Z
 *      0.002  ContactShadows — контактная тень всегда поверх сетки
 */

import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Grid, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

import { getMaterial } from '@/domain/materials'
import { mm } from '@/domain/types'
import { sceneRegistry } from '@/three/registry'
import { useAppStore } from '@/store/useStore'

/** Значение CSS-переменной темы; пустая строка → запасной цвет */
function themeVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.length > 0 ? v : fallback
}

// ── высоты слоёв, м ─────────────────────────────────────────────────────────
const Y_OUTER = -0.003
const Y_INNER = 0.0015
const Y_AXIS = 0.0016

// ── адаптивный шаг ──────────────────────────────────────────────────────────

/** круглые шаги, м */
const SERIES = [0.1, 0.25, 0.5, 1, 2, 5] as const
/** целевой размер ячейки на экране, px */
const PX_MIN = 24
/** гистерезис: пока текущий шаг попадает сюда — не переключаемся */
const PX_KEEP_MIN = 19
const PX_KEEP_MAX = 84
/** не чаще ~4 раз в секунду */
const RECHECK_S = 0.25

/**
 * Наименьший круглый шаг, при котором ячейка не мельче PX_MIN.
 * Шаг ряда — 2…2.5×, значит выбранная ячейка всегда меньше 60 px.
 */
function pickCell(pxPerMeter: number, current: number): number {
  const px = current * pxPerMeter
  if (px >= PX_KEEP_MIN && px <= PX_KEEP_MAX) return current
  for (const s of SERIES) {
    if (s * pxPerMeter >= PX_MIN) return s
  }
  return SERIES[SERIES.length - 1]
}

// ── цвета ───────────────────────────────────────────────────────────────────

/**
 * Сдвиг цвета по светлоте: светлую поверхность притемняем, тёмную —
 * высветляем. Насыщенность гасим — линия должна читаться как тень
 * на поверхности, а не как цветной штрих.
 */
function tint(base: THREE.Color, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }
  base.getHSL(hsl, THREE.SRGBColorSpace)
  const l = hsl.l > 0.5 ? hsl.l - amount : hsl.l + amount
  const out = new THREE.Color()
  out.setHSL(hsl.h, hsl.s * 0.5, THREE.MathUtils.clamp(l, 0, 1), THREE.SRGBColorSpace)
  return out
}

const NO_RAYCAST = () => null

/** depthWrite/polygonOffset у drei Grid задаются только через материал */
function gridMaterial(mesh: THREE.Mesh | null): THREE.Material | null {
  if (!mesh) return null
  const mat = mesh.material
  return Array.isArray(mat) ? null : mat
}

/**
 * Внутренняя сетка: лежит НА полу, поэтому её тянем к камере полигональным
 * смещением — 1.5 мм подъёма плюс offset гарантируют, что z-fighting не будет
 * ни при каком угле.
 */
function setupInner(mesh: THREE.Mesh | null) {
  const mat = gridMaterial(mesh)
  if (!mat) return
  // сетка ничего не заслоняет: ни контактную тень, ни размерные линии
  mat.depthWrite = false
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -4
}

/**
 * Наружная сетка: обязана ПРОИГРЫВАТЬ полу по глубине — именно так она
 * обрезается стенами комнаты. Никакого отрицательного offset: на пологих
 * углах он вытащил бы линии сквозь пол.
 */
function setupOuter(mesh: THREE.Mesh | null) {
  const mat = gridMaterial(mesh)
  if (!mat) return
  mat.depthWrite = false
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 1
  mat.polygonOffsetUnits = 2
}

// ────────────────────────────────────────────────────────────────────────────

export function GroundGrid() {
  const show = useAppStore((s) => s.view.showGrid)
  const showRoom = useAppStore((s) => s.view.showRoom)
  const isPlan = useAppStore((s) => s.view.mode === 'plan')
  const theme = useAppStore((s) => s.view.theme)
  const floorMaterial = useAppStore((s) => s.project.room.floorMaterial)
  const roomW = useAppStore((s) => s.project.room.width)
  const roomD = useAppStore((s) => s.project.room.depth)

  const [cell, setCell] = useState(0.5)
  const acc = useRef(0)

  // ── подбор шага под текущий масштаб ──
  useFrame((state, delta) => {
    if (!show) return
    acc.current += delta
    if (acc.current < RECHECK_S) return
    acc.current = 0

    const cam = state.camera
    let pxPerMeter: number
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
      // фрустум ортокамеры drei задан в ПИКСЕЛЯХ, поэтому zoom = px на метр
      pxPerMeter = (cam as THREE.OrthographicCamera).zoom
    } else {
      const p = cam as THREE.PerspectiveCamera
      const target = sceneRegistry.controls?.target
      const dist = Math.max(0.3, target ? p.position.distanceTo(target) : p.position.length())
      pxPerMeter = state.size.height / (2 * dist * Math.tan((p.fov * Math.PI) / 360))
    }

    const next = pickCell(pxPerMeter, cell)
    if (next !== cell) setCell(next)
  })

  // ── палитра ──
  const colors = useMemo(() => {
    // «чуть заметнее» снаружи: там нет мебели и фактуры, линия работает как горизонт
    const k = isPlan ? 1.35 : 1
    const floor = new THREE.Color(getMaterial(floorMaterial).color)
    const ground = new THREE.Color(themeVar('--scene-bottom', '#0a0b0d')).lerp(
      new THREE.Color(themeVar('--scene-top', '#171a1f')),
      0.4,
    )
    return {
      innerCell: tint(floor, 0.07 * k),
      innerSection: tint(floor, 0.115 * k),
      outerCell: tint(ground, 0.11 * k),
      outerSection: tint(ground, 0.18 * k),
    }
  }, [floorMaterial, theme, isPlan])

  // ── геометрия ──
  const innerArgs = useMemo<[number, number]>(() => [mm(roomW), mm(roomD)], [roomW, roomD])
  const outerArgs = useMemo<[number, number]>(
    () => [mm(roomW) + 6, mm(roomD) + 6],
    [roomW, roomD],
  )
  const axisHalf = useMemo(() => Math.max(mm(roomW), mm(roomD)) / 2 + 1.2, [roomW, roomD])

  const axisX = useMemo<[number, number, number][]>(
    () => [
      [-axisHalf, Y_AXIS, 0],
      [axisHalf, Y_AXIS, 0],
    ],
    [axisHalf],
  )
  const axisZ = useMemo<[number, number, number][]>(
    () => [
      [0, Y_AXIS, -axisHalf],
      [0, Y_AXIS, axisHalf],
    ],
    [axisHalf],
  )

  const axisColors = useMemo(
    () => ({ x: themeVar('--danger', '#ff5f56'), z: themeVar('--magnet', '#4ea8ff') }),
    [theme],
  )

  if (!show) return null

  const section = cell * 5
  // дальше в кадре сетка растворяется: чем крупнее ячейка, тем дальше край
  const outerFade = THREE.MathUtils.clamp(cell * 70, 20, 160)

  return (
    <group name="ground-grid">
      {/* снаружи комнаты: лежит НИЖЕ пола, внутри комнаты пол её перекрывает */}
      <Grid
        ref={setupOuter}
        args={outerArgs}
        position={[0, Y_OUTER, 0]}
        cellSize={cell}
        cellThickness={0.6}
        sectionSize={section}
        sectionThickness={0.9}
        cellColor={colors.outerCell}
        sectionColor={colors.outerSection}
        fadeDistance={outerFade}
        fadeStrength={1.6}
        infiniteGrid
        renderOrder={-3}
        raycast={NO_RAYCAST}
      />

      {/* внутри комнаты: едва различимая подложка на полу */}
      {showRoom && (
        <Grid
          ref={setupInner}
          args={innerArgs}
          position={[0, Y_INNER, 0]}
          cellSize={cell}
          cellThickness={0.55}
          sectionSize={section}
          sectionThickness={0.85}
          cellColor={colors.innerCell}
          sectionColor={colors.innerSection}
          fadeDistance={400}
          fadeStrength={1}
          renderOrder={-2}
          raycast={NO_RAYCAST}
        />
      )}

      <Line
        points={axisX}
        color={axisColors.x}
        lineWidth={0.9}
        transparent
        opacity={isPlan ? 0.3 : 0.22}
        depthWrite={false}
        renderOrder={-1}
        raycast={NO_RAYCAST}
      />
      <Line
        points={axisZ}
        color={axisColors.z}
        lineWidth={0.9}
        transparent
        opacity={isPlan ? 0.3 : 0.22}
        depthWrite={false}
        renderOrder={-1}
        raycast={NO_RAYCAST}
      />
    </group>
  )
}
