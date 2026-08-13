/**
 * Чертёжный слой режима «План».
 *
 * Вид сверху сам по себе — это фотография с тенями и бликами: полки освещены,
 * фасады бликуют, планировать по такой картинке нельзя. Планировка требует
 * ЧЕРТЕЖА, поэтому поверх сцены рисуется отдельный слой:
 *
 *   • пятно застройки каждого юнита — залитый прямоугольник с контуром;
 *   • указатель фасада — шеврон у ПЕРЕДНЕЙ грани (локальный +Z);
 *   • перегородки внутри пятна — тонкие линии по границам колонок;
 *   • подпись: имя и габарит «Ш×Г»;
 *   • контур комнаты по внутренним размерам + две размерные линии;
 *   • РУЧКИ СТЕН — комнату можно растянуть мышью, а не только цифрами.
 *
 * Слой рендерится вне sceneRegistry.content — в экспорт GLB не попадает.
 *
 * Чертёж статичен: единственный useFrame здесь — коммит перетаскивания стены
 * (раз в кадр, чтобы не забить историю undo).
 *
 * ЕДИНИЦЫ: домен в мм, сцена в метрах — конвертация только в toM().
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'

import { colSpans, elevationOf, outerSize } from '@/domain/frame'
import { MM, mm } from '@/domain/types'
import type { ShelfUnit } from '@/domain/types'
import { INTL_LOCALE, t } from '@/i18n'
import { appState, useAppStore, useRoom, useUnits } from '@/store/useStore'
import { roomResize } from '@/three/Camera'
import { sceneRegistry } from '@/three/registry'

/** неразрывный пробел — число не отрывается от единицы измерения */
const NBSP = ' '

/** Число по локали сборки: 1 240 / 1,240 */
function nfmt(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(INTL_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

/** «1 240 мм» / «1,240 mm» */
function lenLabel(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const decimals = Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1
  return `${nfmt(v, decimals)}${NBSP}${t('мм')}`
}

/** Значение CSS-переменной темы; пустая строка → запасной цвет */
function themeVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.length > 0 ? v : fallback
}

type P3 = [number, number, number]

/** мм → метры сцены */
const toM = (p: P3): P3 => [mm(p[0]), mm(p[1]), mm(p[2])]

// ── высоты слоёв чертежа, мм (реального перекрытия нет: depthTest выключен) ──
const Y_ROOM = 18
const Y_FILL = 20
const Y_PART = 21
const Y_EDGE = 22
const Y_HANDLE = 26

// ── порядок отрисовки: чертёж всегда поверх сцены ──
const R_ROOM = 38
const R_HANDLE = 44

/**
 * Штабель на плане — это наложенные пятна, и порядок отрисовки решает всё.
 *
 * Юниты рисуются НЕ одним слоем на всех, а блоками: у каждого «этажа» свой
 * base, внутри которого лежат заливка/перегородки/контур. Иначе контур нижней
 * секции лёг бы поверх заливки верхней, и понять, что стоит на чём, стало бы
 * нельзя. Шаг дробный: renderOrder — обычное число, сортировка по нему точная.
 *
 * Этажей учитываем не больше R_LAYER_MAX: выше начинались бы ручки стен (44),
 * а они обязаны оставаться доступными для мыши поверх любого чертежа.
 */
const R_UNIT = 40
const R_LAYER_STEP = 0.5
const R_LAYER_MAX = 7
const O_FILL = 0
const O_PART = 0.1
const O_EDGE = 0.2

/** Отступ внутренней нитки двойной обводки и вынос подписи «+740», мм */
const LIFT_INSET = 28

/**
 * Размерные линии комнаты, мм.
 *
 * Идут ВНУТРЬ, а не наружу: камера в «Плане» садится ровно по содержимому
 * (комната + юниты) с запасом 8 %, и вынос наружу гарантированно уехал бы
 * за край кадра — размеры комнаты просто не были бы видны.
 */
const ROOM_INSET = 300
const ROOM_TICK = 120
const ROOM_GAP = 40

// ── указатель фасада, мм ──
const ARROW_MIN = 60
const ARROW_MAX = 220

// ────────────────────────────────────────────────────────────────────────────
//  Плашки
// ────────────────────────────────────────────────────────────────────────────

const PLAQUE: CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 6px',
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  textAlign: 'center',
  boxShadow: 'var(--shadow-sm)',
  pointerEvents: 'none',
  userSelect: 'none',
}

function UnitLabel({ at, name, dims }: { at: P3; name: string; dims: string }) {
  return (
    <Html
      position={at}
      center
      occlude={false}
      pointerEvents="none"
      zIndexRange={[26, 0]}
      wrapperClass="r3f-html-passthrough"
    >
      <div style={PLAQUE}>
        <div style={{ fontSize: 10.5, color: 'var(--text)' }}>{name}</div>
        <div className="num" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {dims}
        </div>
      </div>
    </Html>
  )
}

function DimLabel({ at, text }: { at: P3; text: string }) {
  return (
    <Html
      position={at}
      center
      occlude={false}
      pointerEvents="none"
      zIndexRange={[25, 0]}
      wrapperClass="r3f-html-passthrough"
    >
      <div className="num" style={{ ...PLAQUE, fontSize: 10, color: 'var(--text-dim)' }}>
        {text}
      </div>
    </Html>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Один юнит
// ────────────────────────────────────────────────────────────────────────────

interface UnitPlanGeom {
  /** размеры пятна, м */
  w: number
  d: number
  loop: P3[]
  /** вторая нитка обводки внутрь — метка «эта секция поднята» */
  inner: P3[]
  arrow: P3[]
  /** перегородки парами (LineSegments) */
  parts: P3[]
  /** место подписи высоты — у заднего левого угла пятна */
  tagAt: P3
  dims: string
}

function buildUnitPlan(u: ShelfUnit): UnitPlanGeom {
  const { x: W, z: D } = outerSize(u.frame)
  const hw = W / 2
  const hd = D / 2

  const loop: P3[] = [
    [-hw, Y_EDGE, -hd],
    [hw, Y_EDGE, -hd],
    [hw, Y_EDGE, hd],
    [-hw, Y_EDGE, hd],
    [-hw, Y_EDGE, -hd],
  ]

  // вторая нитка: на узком пятне отступ ужимается, иначе она схлопнулась бы
  const ins = Math.min(LIFT_INSET, Math.min(W, D) * 0.08)
  const iw = hw - ins
  const idz = hd - ins
  const inner: P3[] = [
    [-iw, Y_EDGE, -idz],
    [iw, Y_EDGE, -idz],
    [iw, Y_EDGE, idz],
    [-iw, Y_EDGE, idz],
    [-iw, Y_EDGE, -idz],
  ]

  // шеврон у передней грани: остриё смотрит в +Z, то есть «куда стеллаж лицом»
  const a = Math.min(ARROW_MAX, Math.max(ARROW_MIN, Math.min(W, D) * 0.3))
  const tipZ = hd - a * 0.18
  const baseZ = tipZ - a * 0.7
  const arrow: P3[] = [
    [-a / 2, Y_EDGE, baseZ],
    [0, Y_EDGE, tipZ],
    [a / 2, Y_EDGE, baseZ],
  ]

  // перегородки — по серединам промежутков между чистыми проёмами колонок
  const cs = colSpans(u.frame)
  const parts: P3[] = []
  for (let i = 0; i + 1 < cs.length; i++) {
    const x = (cs[i].b + cs[i + 1].a) / 2
    parts.push([x, Y_PART, -hd], [x, Y_PART, hd])
  }

  // подпись садится внутрь от угла: плашка центрируется на точке и, стоя
  // ровно на углу, свешивалась бы половиной за пятно
  const tag = Math.max(60, Math.min(200, Math.min(W, D) * 0.22))

  return {
    w: mm(W),
    d: mm(D),
    loop: loop.map(toM),
    inner: inner.map(toM),
    arrow: arrow.map(toM),
    parts: parts.map(toM),
    tagAt: toM([-hw + tag, Y_EDGE, -hd + tag]),
    dims: `${Math.round(W)}×${Math.round(D)}`,
  }
}

/** Подпись «+740» у угла: сразу видно, что секция стоит НА чём-то, а не рядом */
function LiftTag({ at, text, color }: { at: P3; text: string; color: string }) {
  return (
    <Html
      position={at}
      center
      occlude={false}
      pointerEvents="none"
      zIndexRange={[28, 0]}
      wrapperClass="r3f-html-passthrough"
    >
      <div className="num" style={{ ...PLAQUE, fontSize: 9.5, color, borderColor: color }}>
        {text}
      </div>
    </Html>
  )
}

interface UnitPlanProps {
  unit: ShelfUnit
  /** «этаж» штабеля: чем выше, тем позже рисуется */
  layer: number
  ink: string
  faint: string
  accent: string
  dim: string
  fill: string
  fillSel: string
}

function UnitPlan({ unit, layer, ink, faint, accent, dim, fill, fillSel }: UnitPlanProps) {
  // во время драга позиция живёт в сторе — план обязан ехать вместе с юнитом
  const live = useAppStore((s) => s.drag?.live[unit.id] ?? null)
  const selected = useAppStore((s) => s.sel.units.includes(unit.id))
  const hovered = useAppStore((s) => s.hoverUnit === unit.id)

  const g = useMemo(() => buildUnitPlan(unit), [unit])

  const pos = live ? live.pos : unit.pos
  const rotY = live ? live.rotY : unit.rotY
  const elev = live ? live.elevation : elevationOf(unit)
  // полмиллиметра — не «поднят», а погрешность ввода
  const raised = elev > 0.5

  const edge = selected ? accent : hovered ? dim : ink
  const edgeWidth = selected ? 2.5 : hovered ? 2.5 : 2

  const base = R_UNIT + Math.min(layer, R_LAYER_MAX) * R_LAYER_STEP

  return (
    <group position={[mm(pos.x), 0, mm(pos.z)]} rotation={[0, rotY, 0]}>
      {/* пятно застройки */}
      <mesh position={[0, mm(Y_FILL), 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={base + O_FILL}>
        <planeGeometry args={[g.w, g.d]} />
        <meshBasicMaterial
          color={selected ? fillSel : fill}
          transparent
          // поднятая секция чуть плотнее: под ней лежит пятно нижней,
          // и просвечивать сквозь неё чертёж не должен
          opacity={raised ? 1 : selected ? 0.95 : 0.9}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {g.parts.length > 0 && (
        <Line
          points={g.parts}
          segments
          color={faint}
          lineWidth={1}
          transparent
          opacity={0.9}
          toneMapped={false}
          depthTest={false}
          depthWrite={false}
          renderOrder={base + O_PART}
        />
      )}

      {/* transparent обязателен: без него линия уходит в НЕпрозрачный проход,
          который рисуется раньше заливки, и заливка закрашивает контур */}
      <Line
        points={g.loop}
        color={edge}
        lineWidth={edgeWidth}
        transparent
        opacity={1}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={base + O_EDGE}
      />

      {raised && (
        <Line
          points={g.inner}
          color={edge}
          lineWidth={1}
          transparent
          opacity={0.75}
          toneMapped={false}
          depthTest={false}
          depthWrite={false}
          renderOrder={base + O_EDGE}
        />
      )}

      <Line
        points={g.arrow}
        color={edge}
        lineWidth={1.6}
        transparent
        opacity={0.85}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={base + O_EDGE}
      />

      <UnitLabel at={[0, mm(Y_EDGE), 0]} name={unit.name} dims={g.dims} />
      {raised && <LiftTag at={g.tagAt} text={`+${nfmt(Math.round(elev))}`} color={accent} />}
    </group>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Комната
// ────────────────────────────────────────────────────────────────────────────

interface RoomPlanGeom {
  loop: P3[]
  /** размерные линии + засечки + выносные, парами */
  marks: P3[]
  wLine: P3[]
  dLine: P3[]
  wAt: P3
  dAt: P3
}

function buildRoomPlan(W: number, D: number): RoomPlanGeom {
  const hw = W / 2
  const hd = D / 2

  const loop: P3[] = [
    [-hw, Y_ROOM, -hd],
    [hw, Y_ROOM, -hd],
    [hw, Y_ROOM, hd],
    [-hw, Y_ROOM, hd],
    [-hw, Y_ROOM, -hd],
  ]

  // ширина — вдоль передней стены (+Z), глубина — вдоль правой (+X);
  // на маленькой комнате отступ ужимается, чтобы линия не ушла за середину
  const zw = hd - Math.min(ROOM_INSET, D * 0.18)
  const xd = hw - Math.min(ROOM_INSET, W * 0.18)
  const wLine: P3[] = [
    [-hw, Y_ROOM, zw],
    [hw, Y_ROOM, zw],
  ]
  const dLine: P3[] = [
    [xd, Y_ROOM, -hd],
    [xd, Y_ROOM, hd],
  ]

  const t = ROOM_TICK / 2
  const marks: P3[] = [
    // засечки размерной линии ширины
    [-hw, Y_ROOM, zw - t],
    [-hw, Y_ROOM, zw + t],
    [hw, Y_ROOM, zw - t],
    [hw, Y_ROOM, zw + t],
    // выносные линии от передней стены внутрь, мимо размерной
    [-hw, Y_ROOM, hd - ROOM_GAP],
    [-hw, Y_ROOM, zw - t],
    [hw, Y_ROOM, hd - ROOM_GAP],
    [hw, Y_ROOM, zw - t],
    // засечки размерной линии глубины
    [xd - t, Y_ROOM, -hd],
    [xd + t, Y_ROOM, -hd],
    [xd - t, Y_ROOM, hd],
    [xd + t, Y_ROOM, hd],
    // выносные от правой стены
    [hw - ROOM_GAP, Y_ROOM, -hd],
    [xd - t, Y_ROOM, -hd],
    [hw - ROOM_GAP, Y_ROOM, hd],
    [xd - t, Y_ROOM, hd],
  ]

  return {
    loop: loop.map(toM),
    marks: marks.map(toM),
    wLine: wLine.map(toM),
    dLine: dLine.map(toM),
    wAt: toM([0, Y_ROOM, zw]),
    dAt: toM([xd, Y_ROOM, 0]),
  }
}

function RoomPlan({ dim }: { dim: string }) {
  const room = useRoom()
  const g = useMemo(() => buildRoomPlan(room.width, room.depth), [room.width, room.depth])

  return (
    <group>
      <Line
        points={g.loop}
        color={dim}
        lineWidth={3}
        transparent
        opacity={1}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={R_ROOM}
      />
      <Line
        points={g.wLine}
        color={dim}
        lineWidth={1.2}
        transparent
        opacity={0.9}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={R_ROOM}
      />
      <Line
        points={g.dLine}
        color={dim}
        lineWidth={1.2}
        transparent
        opacity={0.9}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={R_ROOM}
      />
      <Line
        points={g.marks}
        segments
        color={dim}
        lineWidth={1.2}
        transparent
        opacity={0.6}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        renderOrder={R_ROOM}
      />
      <DimLabel at={g.wAt} text={nfmt(Math.round(room.width))} />
      <DimLabel at={g.dAt} text={nfmt(Math.round(room.depth))} />
    </group>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Ручки стен: комната тянется мышью
// ────────────────────────────────────────────────────────────────────────────

/**
 * Комната центрирована в начале координат, и это не украшение: на нулевой точке
 * стоят все привязки, размерные линии и посадка камеры. Поэтому ручка НЕ двигает
 * одну грань — она меняет размер комнаты СИММЕТРИЧНО от центра: противоположная
 * стена уезжает ровно настолько же. Это видно по плашке размера у ручки.
 *
 * Пределы — как в инспекторе, шаг — сетка привязок (если она включена).
 */
const ROOM_MIN = 1000
const ROOM_MAX = 30000

type Side = 'left' | 'right' | 'front' | 'back'
const SIDES: Side[] = ['left', 'right', 'front', 'back']

/** левая/правая ручка живёт на оси X и управляет ШИРИНОЙ */
const isX = (s: Side) => s === 'left' || s === 'right'
/** знак полуоси, на которой стоит стена */
const dirOf = (s: Side) => (s === 'right' || s === 'front' ? 1 : -1)

const CURSOR: Record<Side, string> = {
  left: 'ew-resize',
  right: 'ew-resize',
  front: 'ns-resize',
  back: 'ns-resize',
}
const TITLE: Record<Side, string> = {
  left: t('Ширина'),
  right: t('Ширина'),
  front: t('Глубина'),
  back: t('Глубина'),
}

/** плоскость ручек горизонтальна */
const FLAT: P3 = [-Math.PI / 2, 0, 0]

interface HandleGeom {
  side: Side
  /** толстая линия по внутренней грани стены */
  line: P3[]
  /** центр хвата, м */
  at: P3
  /** плашка размера — внутрь комнаты, чтобы не уехать за край кадра */
  labelAt: P3
  /** зона захвата (X, Z), м */
  band: [number, number]
  /** видимый хват (X, Z), м */
  grip: [number, number]
}

/**
 * Зона захвата лежит СНАРУЖИ от внутренней грани стены.
 *
 * Внутри комнаты по тем же пикселям идут хит-боксы юнитов (useUnitDrag слушает
 * canvas и получает pointerdown РАНЬШЕ, чем событийная система R3F): полка,
 * придвинутая к стене, воевала бы с ручкой за один и тот же клик.
 *
 * Размеры ручки пропорциональны комнате, потому что камера «Плана» садится
 * ровно по содержимому — так ручка занимает одинаковое место на экране
 * и для кладовки 2×3, и для зала 30×20.
 */
function buildHandles(W: number, D: number): HandleGeom[] {
  const u = Math.min(3, Math.max(0.4, Math.min(W, D) / 6000))
  const across = 260 * u
  const gripLong = 150 * u
  const gripThick = 28 * u

  return SIDES.map((side) => {
    const x = isX(side)
    const dir = dirOf(side)
    const size = x ? W : D
    const len = x ? D : W
    const wall = (dir * size) / 2
    // полоса не доходит до углов: иначе соседние ручки спорят за угловую точку
    const bandLen = Math.max(len * 0.4, len - 2 * across)
    const off = wall + dir * (across / 2)
    const lab = wall - dir * (across * 1.2)
    const line: P3[] = x
      ? [
          [wall, Y_HANDLE, -len / 2],
          [wall, Y_HANDLE, len / 2],
        ]
      : [
          [-len / 2, Y_HANDLE, wall],
          [len / 2, Y_HANDLE, wall],
        ]

    return {
      side,
      line: line.map(toM),
      at: toM(x ? [off, Y_HANDLE, 0] : [0, Y_HANDLE, off]),
      labelAt: toM(x ? [lab, Y_HANDLE, 0] : [0, Y_HANDLE, lab]),
      band: x ? [mm(across), mm(bandLen)] : [mm(bandLen), mm(across)],
      grip: x ? [mm(gripThick), mm(gripLong)] : [mm(gripLong), mm(gripThick)],
    }
  })
}

interface Parked {
  obj: { enabled: boolean }
  was: boolean
}

interface HandleSession {
  side: Side
  pointerId: number
  /** размер комнаты на момент захвата, мм */
  startSize: number
  /** точка захвата по рабочей оси, мм */
  grab: number
  parked: Parked[]
}

function asToggleable(o: unknown): { enabled: boolean } | null {
  if (o && typeof o === 'object' && 'enabled' in o) return o as { enabled: boolean }
  return null
}

/** R3F подменяет event.target объектом с API захвата указателя */
interface CaptureTarget {
  setPointerCapture: (id: number) => void
  releasePointerCapture: (id: number) => void
}
function captureTarget(t: unknown): CaptureTarget | null {
  if (t && typeof t === 'object' && 'setPointerCapture' in t) return t as CaptureTarget
  return null
}

function RoomHandles({ dim, accent }: { dim: string; accent: string }) {
  const W = useAppStore((s) => s.project.room.width)
  const D = useAppStore((s) => s.project.room.depth)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  const [hover, setHover] = useState<Side | null>(null)
  const [active, setActive] = useState<Side | null>(null)

  const geom = useMemo(() => buildHandles(W, D), [W, D])

  const session = useRef<HandleSession | null>(null)
  /** накопленный за кадр размер: в стор уходит ровно раз в кадр */
  const pending = useRef<{ width?: number; depth?: number } | null>(null)

  // ноль аллокаций на событие
  const kit = useMemo(
    () => ({
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -mm(Y_HANDLE)),
      point: new THREE.Vector3(),
    }),
    [],
  )

  /** Точка курсора в плоскости ручек, мм */
  const worldAt = useCallback(
    (ev: PointerEvent): { x: number; z: number } | null => {
      const r = gl.domElement.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return null
      kit.ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      )
      kit.ray.setFromCamera(kit.ndc, camera)
      const p = kit.ray.ray.intersectPlane(kit.plane, kit.point)
      return p ? { x: p.x / MM, z: p.z / MM } : null
    },
    [camera, gl, kit],
  )

  // ── коммит в стор не чаще раза в кадр ──
  useFrame(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    appState().updateRoom(p)
  })

  const stop = useCallback(
    (revert: boolean) => {
      const s = session.current
      if (!s) return
      session.current = null
      const p = pending.current
      pending.current = null
      for (const q of s.parked) q.obj.enabled = q.was
      s.parked.length = 0
      roomResize.active = false
      setActive(null)
      gl.domElement.style.cursor = ''
      const patch = revert
        ? isX(s.side)
          ? { width: s.startSize }
          : { depth: s.startSize }
        : p
      if (patch) appState().updateRoom(patch)
    },
    [gl],
  )

  const onDown = useCallback(
    (side: Side, e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || session.current) return
      e.stopPropagation()

      /**
       * Тот же pointerdown уже видел useUnitDrag (он слушает сам canvas, а R3F —
       * контейнер, то есть позже). Если под ручкой оказался юнит, вышедший за
       * стену, потащились бы оба. Гасим чужую сессию тем же событием, которым её
       * гасит система, — до того, как заберём контролы себе.
       */
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.pointerId }))

      const at = worldAt(e.nativeEvent)
      if (!at) return

      const parked: Parked[] = []
      for (const c of [asToggleable(controls), asToggleable(sceneRegistry.controls)]) {
        if (c && !parked.some((q) => q.obj === c)) parked.push({ obj: c, was: c.enabled })
      }
      for (const q of parked) q.obj.enabled = false

      session.current = {
        side,
        pointerId: e.pointerId,
        startSize: isX(side) ? W : D,
        grab: isX(side) ? at.x : at.z,
        parked,
      }
      // камера не переподсаживается, пока стена в руке: иначе масштаб кадра
      // менялся бы под курсором и стена «убегала» бы от него
      roomResize.active = true
      setActive(side)
      captureTarget(e.target)?.setPointerCapture(e.pointerId)
      gl.domElement.style.cursor = CURSOR[side]
    },
    [W, D, controls, gl, worldAt],
  )

  const onMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = session.current
      if (!s || e.pointerId !== s.pointerId) return
      e.stopPropagation()
      const at = worldAt(e.nativeEvent)
      if (!at) return

      const x = isX(s.side)
      const cur = x ? at.x : at.z
      // стена ушла на delta — комната выросла на 2·delta (симметрия от центра)
      let next = s.startSize + 2 * (cur - s.grab) * dirOf(s.side)

      const snap = appState().snap
      if (snap.grid && snap.gridSize > 0) next = Math.round(next / snap.gridSize) * snap.gridSize
      next = Math.min(ROOM_MAX, Math.max(ROOM_MIN, Math.round(next)))

      pending.current = x ? { width: next } : { depth: next }
    },
    [worldAt],
  )

  const onUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = session.current
      if (!s || e.pointerId !== s.pointerId) return
      e.stopPropagation()
      captureTarget(e.target)?.releasePointerCapture(e.pointerId)
      stop(false)
    },
    [stop],
  )

  // ── аварийные выходы: системная отмена, потеря фокуса, Escape ──
  useEffect(() => {
    const onCancel = () => stop(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !session.current) return
      ev.preventDefault()
      stop(true)
    }
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
      window.removeEventListener('keydown', onKey)
      stop(false)
    }
  }, [stop])

  return (
    <group name="room-handles">
      {geom.map((g) => {
        const on = active === g.side || hover === g.side
        const live = active === g.side
        const size = isX(g.side) ? W : D
        return (
          <group key={g.side}>
            <Line
              points={g.line}
              color={on ? accent : dim}
              lineWidth={on ? 4 : 2.5}
              transparent
              opacity={on ? 1 : 0.75}
              toneMapped={false}
              depthTest={false}
              depthWrite={false}
              renderOrder={R_HANDLE}
            />

            {/* зона захвата: невидима, но рейкастится (visible=false тут нельзя) */}
            <mesh
              position={g.at}
              rotation={FLAT}
              renderOrder={R_HANDLE}
              onPointerOver={() => {
                setHover(g.side)
                if (!session.current) gl.domElement.style.cursor = CURSOR[g.side]
              }}
              onPointerOut={() => {
                setHover(null)
                if (!session.current) gl.domElement.style.cursor = ''
              }}
              onPointerDown={(e) => onDown(g.side, e)}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              <planeGeometry args={g.band} />
              <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} colorWrite={false} />
            </mesh>

            {/* видимый хват */}
            <mesh position={g.at} rotation={FLAT} renderOrder={R_HANDLE}>
              <planeGeometry args={g.grip} />
              <meshBasicMaterial
                color={on ? accent : dim}
                transparent
                opacity={on ? 1 : 0.8}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            {on && (
              <Html
                position={g.labelAt}
                center
                occlude={false}
                pointerEvents="none"
                zIndexRange={[27, 0]}
                wrapperClass="r3f-html-passthrough"
              >
                <div
                  style={{
                    ...PLAQUE,
                    borderColor: live ? 'var(--accent)' : 'var(--border)',
                    fontSize: 10.5,
                    color: live ? 'var(--accent)' : 'var(--text-dim)',
                  }}
                >
                  <span className="num">
                    {TITLE[g.side]} {lenLabel(size)}
                  </span>
                  {live && (
                    <div style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
                      {t('симметрично от центра')}
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function PlanBody() {
  const theme = useAppStore((s) => s.view.theme)
  const showRoom = useAppStore((s) => s.view.showRoom)
  const units = useUnits()

  const c = useMemo(
    () => ({
      ink: themeVar('--text', '#e8eaed'),
      dim: themeVar('--text-dim', '#9aa1ab'),
      faint: themeVar('--text-faint', '#646c76'),
      accent: themeVar('--accent', '#e8b04b'),
      fill: themeVar('--bg-elevated', '#1c2025'),
      fillSel: themeVar('--bg-hover', '#23272d'),
    }),
    [theme],
  )

  /**
   * Порядок отрисовки — по высоте установки: верхние секции штабеля ложатся
   * на чертёж последними и потому видны целиком.
   *
   * «Этаж» считается по УРОВНЯМ, а не по номеру юнита: две секции на одной
   * высоте — один этаж, и лишних сдвигов renderOrder не появляется.
   * Берём высоту из проекта: за драг она не меняется (её двигает штабелирование,
   * а оно коммитится сразу), поэтому пересортировывать каждый кадр незачем.
   */
  const ordered = useMemo(() => {
    const vis = units.filter((u) => !u.hidden)
    const levels = [...new Set(vis.map((u) => Math.round(elevationOf(u))))].sort((a, b) => a - b)
    return vis
      .map((u) => ({ u, layer: levels.indexOf(Math.round(elevationOf(u))) }))
      .sort((a, b) => a.layer - b.layer)
  }, [units])

  return (
    <group name="plan-overlay">
      {showRoom && (
        <>
          <RoomPlan dim={c.dim} />
          <RoomHandles dim={c.dim} accent={c.accent} />
        </>
      )}
      {ordered.map(({ u, layer }) => (
        <UnitPlan
          key={u.id}
          unit={u}
          layer={layer}
          ink={c.ink}
          dim={c.dim}
          faint={c.faint}
          accent={c.accent}
          fill={c.fill}
          fillSel={c.fillSel}
        />
      ))}
    </group>
  )
}

/** Чертёж поверх сцены; вне режима «План» слоя не существует */
export function PlanOverlay() {
  const isPlan = useAppStore((s) => s.view.mode === 'plan')
  if (!isPlan) return null
  return <PlanBody />
}
