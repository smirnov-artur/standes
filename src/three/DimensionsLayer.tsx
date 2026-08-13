/**
 * Размерный слой: чертёжные выноски поверх сцены.
 *
 * Выбранные юниты получают три размерные линии (ширина / высота / глубина)
 * с засечками и выносными линиями, ячейка под курсором — размер проёма,
 * соседние юниты ближе 400 мм — размер зазора (красный, если пересечение).
 *
 * Слой рендерится вне sceneRegistry.content — в экспорт GLB не попадает.
 */

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Html, Line } from '@react-three/drei'

import { cellRects, footprintCorners, outerSize } from '@/domain/frame'
import { mm } from '@/domain/types'
import type { ShelfUnit, Vec2 } from '@/domain/types'
import { INTL_LOCALE } from '@/i18n'
import { useAppStore, useUnits } from '@/store/useStore'

/** неразрывный пробел вокруг знака умножения — строка габаритов не рвётся */
const NBSP = ' '

/** Число по локали сборки: 1 240 / 1,240 */
function nfmt(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat(INTL_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

/** Одно измерение внутри строки габаритов: без разрядов, без единиц */
function dimPart(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const decimals = Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1
  return new Intl.NumberFormat(INTL_LOCALE, {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

/** «1000 × 400 × 18» — толщина необязательна */
function dimsLabel(w: number, h: number, thickness?: number): string {
  const parts = [dimPart(w), dimPart(h)]
  if (thickness !== undefined) parts.push(dimPart(thickness))
  return parts.join(`${NBSP}×${NBSP}`)
}

/** Значение CSS-переменной темы; пустая строка → запасной цвет */
function themeVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.length > 0 ? v : fallback
}

// ── чертёжные константы, мм ─────────────────────────────────────────────────

/** подъём напольных линий, чтобы не спорили с полом */
const LIFT = 6
/** длина засечки (45°) */
const TICK = 90
/** вынос выносной линии за размерную */
const OVER = 60
/** отступ выносной линии от габарита */
const GAPX = 30
/** отступы размерных линий от габарита */
const OFF_W = 160
const OFF_H = 160
const OFF_D = 360
/** максимальный зазор, который показываем */
const GAP_MAX = 400

// ── вектора (мм, тройки) ────────────────────────────────────────────────────

type P3 = [number, number, number]

const add3 = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub3 = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale3 = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k]
const mid3 = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
function norm3(a: P3): P3 {
  const l = Math.hypot(a[0], a[1], a[2])
  return l > 1e-9 ? scale3(a, 1 / l) : [0, 0, 0]
}
/** мм → метры сцены */
const toM = (p: P3): P3 => [mm(p[0]), mm(p[1]), mm(p[2])]

// ────────────────────────────────────────────────────────────────────────────
//  Плашка с числом
// ────────────────────────────────────────────────────────────────────────────

const PLAQUE: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 5px',
  fontSize: 10,
  lineHeight: 1.3,
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow-sm)',
  pointerEvents: 'none',
  userSelect: 'none',
}

function Plaque({ at, text, danger }: { at: P3; text: string; danger?: boolean }) {
  // distanceFactor годится только для перспективы: в орто drei умножает масштаб
  // на camera.zoom (в метровой сцене это сотни), и плашка залила бы весь кадр
  const persp = useAppStore((s) => s.view.mode === '3d')
  return (
    <Html
      position={at}
      center
      distanceFactor={persp ? 6 : undefined}
      occlude={false}
      pointerEvents="none"
      zIndexRange={[24, 0]}
      wrapperClass="r3f-html-passthrough"
    >
      <div className="num" style={{ ...PLAQUE, color: danger ? 'var(--danger)' : 'var(--text)' }}>
        {text}
      </div>
    </Html>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Одна размерная линия
// ────────────────────────────────────────────────────────────────────────────

interface DimDef {
  key: string
  /** точки габарита, от которых идут выносные линии, мм */
  fa: P3
  fb: P3
  /** направление выноса (единичное) */
  ext: P3
  /** отступ размерной линии от габарита, мм */
  off: number
  /** подпись, мм */
  value: number
}

interface DimGeom {
  main: P3[]
  /** засечки + выносные, парами (LineSegments) */
  marks: P3[]
  label: P3
}

function buildDim(d: DimDef): DimGeom {
  const a = add3(d.fa, scale3(d.ext, d.off))
  const b = add3(d.fb, scale3(d.ext, d.off))
  const dir = norm3(sub3(b, a))
  // засечка как на чертеже — короткий штрих под 45° к размерной линии
  const half = scale3(norm3(add3(dir, d.ext)), TICK / 2)
  const marks: P3[] = [
    sub3(a, half),
    add3(a, half),
    sub3(b, half),
    add3(b, half),
    add3(d.fa, scale3(d.ext, GAPX)),
    add3(a, scale3(d.ext, OVER)),
    add3(d.fb, scale3(d.ext, GAPX)),
    add3(b, scale3(d.ext, OVER)),
  ]
  return { main: [toM(a), toM(b)], marks: marks.map(toM), label: toM(mid3(a, b)) }
}

function Dim({ def, color }: { def: DimDef; color: string }) {
  const g = useMemo(() => buildDim(def), [def])
  return (
    <>
      <Line
        points={g.main}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.95}
        depthWrite={false}
        renderOrder={3}
      />
      <Line
        points={g.marks}
        segments
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.6}
        depthWrite={false}
        renderOrder={3}
      />
      <Plaque at={g.label} text={nfmt(Math.round(def.value))} />
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Размеры одного юнита
// ────────────────────────────────────────────────────────────────────────────

function buildUnitDims(u: ShelfUnit): DimDef[] {
  const { x: W, y: H, z: D } = outerSize(u.frame)
  const hw = W / 2
  const hd = D / 2
  return [
    // ширина — спереди, по полу
    {
      key: 'w',
      fa: [-hw, LIFT, hd],
      fb: [hw, LIFT, hd],
      ext: [0, 0, 1],
      off: OFF_W,
      value: W,
    },
    // высота — справа, по переднему ребру
    {
      key: 'h',
      fa: [hw, LIFT, hd],
      fb: [hw, H, hd],
      ext: [1, 0, 0],
      off: OFF_H,
      value: H,
    },
    // глубина — справа, по полу
    {
      key: 'd',
      fa: [hw, LIFT, -hd],
      fb: [hw, LIFT, hd],
      ext: [1, 0, 0],
      off: OFF_D,
      value: D,
    },
  ]
}

/** Замкнутый контур пятна застройки — компактный режим */
function footprintLoop(u: ShelfUnit): P3[] {
  const { x: W, z: D } = outerSize(u.frame)
  const hw = W / 2
  const hd = D / 2
  const pts: P3[] = [
    [-hw, LIFT, -hd],
    [hw, LIFT, -hd],
    [hw, LIFT, hd],
    [-hw, LIFT, hd],
    [-hw, LIFT, -hd],
  ]
  return pts.map(toM)
}

function UnitDims({ unit, full, color }: { unit: ShelfUnit; full: boolean; color: string }) {
  // во время драга позиция живёт в сторе; ссылка стабильна между кадрами
  const live = useAppStore((s) => s.drag?.live[unit.id] ?? null)
  const hoverKey = useAppStore((s) => {
    const h = s.hoverCell
    return h && h.unitId === unit.id ? h.key : null
  })

  const pos = live ? live.pos : unit.pos
  const rotY = live ? live.rotY : unit.rotY

  const dims = useMemo(() => (full ? buildUnitDims(unit) : null), [unit, full])
  const loop = useMemo(() => (full ? null : footprintLoop(unit)), [unit, full])
  const outer = useMemo(() => outerSize(unit.frame), [unit])

  // размер проёма ячейки под курсором
  const hover = useMemo(() => {
    if (!hoverKey) return null
    const r = cellRects(unit).rects.find((x) => x.key === hoverKey)
    if (!r) return null
    return {
      at: toM([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.z1 + 40]),
      text: `${nfmt(Math.round(r.x1 - r.x0))} × ${nfmt(Math.round(r.y1 - r.y0))}`,
    }
  }, [unit, hoverKey])

  return (
    <group position={[mm(pos.x), 0, mm(pos.z)]} rotation={[0, rotY, 0]}>
      {dims?.map((d) => <Dim key={d.key} def={d} color={color} />)}

      {loop && (
        <>
          <Line
            points={loop}
            color={color}
            lineWidth={1.2}
            transparent
            opacity={0.5}
            depthWrite={false}
            renderOrder={3}
          />
          <Plaque
            at={[0, mm(outer.y) + 0.13, mm(outer.z / 2)]}
            text={dimsLabel(outer.x, outer.z, outer.y)}
          />
        </>
      )}

      {hover && <Plaque at={hover.at} text={hover.text} />}
    </group>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Зазоры между соседями
// ────────────────────────────────────────────────────────────────────────────

type Live = Record<string, { pos: Vec2; rotY: number }> | null

interface GapDef {
  key: string
  /** мировые точки, мм */
  a: Vec2
  b: Vec2
  value: number
}

const dot2 = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z
const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Ближайшие точки двух отрезков в плоскости XZ */
function segSeg(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): { d: number; a: Vec2; b: Vec2 } {
  const d1 = sub2(p2, p1)
  const d2 = sub2(q2, q1)
  const r = sub2(p1, q1)
  const a = dot2(d1, d1)
  const e = dot2(d2, d2)
  const f = dot2(d2, r)
  const c = dot2(d1, r)
  let s = 0
  let t = 0
  if (a > 1e-9 && e > 1e-9) {
    const b = dot2(d1, d2)
    const den = a * e - b * b
    s = den > 1e-9 ? clamp01((b * f - c * e) / den) : 0
    t = (b * s + f) / e
    if (t < 0) {
      t = 0
      s = clamp01(-c / a)
    } else if (t > 1) {
      t = 1
      s = clamp01((b - c) / a)
    }
  } else if (a > 1e-9) {
    s = clamp01(-c / a)
  } else if (e > 1e-9) {
    t = clamp01(f / e)
  }
  const pa: Vec2 = { x: p1.x + d1.x * s, z: p1.z + d1.z * s }
  const pb: Vec2 = { x: q1.x + d2.x * t, z: q1.z + d2.z * t }
  return { d: Math.hypot(pa.x - pb.x, pa.z - pb.z), a: pa, b: pb }
}

function project(cs: Vec2[], ax: Vec2): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const c of cs) {
    const p = dot2(c, ax)
    if (p < min) min = p
    if (p > max) max = p
  }
  return { min, max }
}

const centerOf = (c: Vec2[]): Vec2 => ({
  x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4,
  z: (c[0].z + c[1].z + c[2].z + c[3].z) / 4,
})

/**
 * Зазор между двумя пятнами застройки.
 * Ось берём по SAT — ту, вдоль которой фигуры разошлись сильнее всего;
 * размерную линию ставим по центру общей грани, как на чертеже.
 * value < 0 — пересечение (глубина проникновения).
 */
function gapBetween(A: Vec2[], B: Vec2[]): { value: number; a: Vec2; b: Vec2 } | null {
  let axis: Vec2 | null = null
  let minOv = Infinity
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub2(poly[(i + 1) % poly.length], poly[i])
      const len = Math.hypot(e.x, e.z)
      if (len < 1e-9) continue
      const ax: Vec2 = { x: -e.z / len, z: e.x / len }
      const pa = project(A, ax)
      const pb = project(B, ax)
      const ov = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min)
      if (ov < minOv) {
        minOv = ov
        axis = ax
      }
    }
  }
  if (!axis) return null

  // пересечение — подпись между центрами
  if (minOv > 0.5) return { value: -minOv, a: centerOf(A), b: centerOf(B) }

  // ориентируем ось от A к B
  const n: Vec2 =
    project(A, axis).max <= project(B, axis).min ? axis : { x: -axis.x, z: -axis.z }
  const qa = project(A, n)
  const qb = project(B, n)
  const t: Vec2 = { x: -n.z, z: n.x }
  const ta = project(A, t)
  const tb = project(B, t)
  const lo = Math.max(ta.min, tb.min)
  const hi = Math.min(ta.max, tb.max)

  if (lo <= hi) {
    const m = (lo + hi) / 2
    return {
      value: qb.min - qa.max,
      a: { x: n.x * qa.max + t.x * m, z: n.z * qa.max + t.z * m },
      b: { x: n.x * qb.min + t.x * m, z: n.z * qb.min + t.z * m },
    }
  }

  // грани не перекрываются (юниты по диагонали) — ближайшие точки рёбер
  let best = { d: Infinity, a: A[0], b: B[0] }
  for (let e = 0; e < 4; e++) {
    for (let f = 0; f < 4; f++) {
      const r = segSeg(A[e], A[(e + 1) % 4], B[f], B[(f + 1) % 4])
      if (r.d < best.d) best = r
    }
  }
  return { value: best.d, a: best.a, b: best.b }
}

function computeGaps(units: ShelfUnit[], live: Live): GapDef[] {
  const vis = units
    .filter((u) => !u.hidden)
    .map((u) => {
      const l = live ? live[u.id] : undefined
      return l ? { ...u, pos: l.pos, rotY: l.rotY } : u
    })

  const out: GapDef[] = []
  for (let i = 0; i < vis.length; i++) {
    const A: Vec2[] = footprintCorners(vis[i])
    for (let j = i + 1; j < vis.length; j++) {
      const B: Vec2[] = footprintCorners(vis[j])
      const g = gapBetween(A, B)
      if (!g || g.value >= GAP_MAX) continue
      out.push({ key: `${vis[i].id}~${vis[j].id}`, a: g.a, b: g.b, value: g.value })
    }
  }
  return out
}

interface GapProps {
  def: GapDef
  color: string
  danger: string
  /** «План»: линия обязана лежать поверх чертежа PlanOverlay */
  top: boolean
}

function Gap({ def, color, danger, top }: GapProps) {
  const bad = def.value < 0
  const g = useMemo(() => {
    const a: P3 = [def.a.x, LIFT, def.a.z]
    const b: P3 = [def.b.x, LIFT, def.b.z]
    const dir = norm3(sub3(b, a))
    // засечки перпендикулярно линии, в плоскости пола
    const perp = scale3([-dir[2], 0, dir[0]], TICK / 2)
    const marks: P3[] = [sub3(a, perp), add3(a, perp), sub3(b, perp), add3(b, perp)]
    return { main: [toM(a), toM(b)], marks: marks.map(toM), label: toM(mid3(a, b)) }
  }, [def])

  const c = bad ? danger : color
  const order = top ? 44 : 3
  return (
    <>
      <Line
        points={g.main}
        color={c}
        lineWidth={1.2}
        transparent
        opacity={0.95}
        depthTest={!top}
        depthWrite={false}
        renderOrder={order}
      />
      <Line
        points={g.marks}
        segments
        color={c}
        lineWidth={1.2}
        transparent
        opacity={0.6}
        depthTest={!top}
        depthWrite={false}
        renderOrder={order}
      />
      <Plaque at={g.label} text={nfmt(Math.round(def.value))} danger={bad} />
    </>
  )
}

function GapDims({ color, danger, top }: { color: string; danger: string; top: boolean }) {
  const units = useUnits()
  const live = useAppStore((s) => s.drag?.live ?? null)
  const gaps = useMemo(() => computeGaps(units, live), [units, live])
  return (
    <>
      {gaps.map((g) => (
        <Gap key={g.key} def={g} color={color} danger={danger} top={top} />
      ))}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function DimensionsLayer() {
  const show = useAppStore((s) => s.view.showDimensions)
  const theme = useAppStore((s) => s.view.theme)
  const isPlan = useAppStore((s) => s.view.mode === 'plan')
  const units = useUnits()
  const selIds = useAppStore((s) => s.sel.units)

  const colors = useMemo(
    () => ({
      dim: themeVar('--text-dim', '#9aa1ab'),
      danger: themeVar('--danger', '#ff5f56'),
    }),
    [theme],
  )

  // ничего не выбрано — показываем только габарит каждого юнита
  const shown = useMemo(() => {
    const visible = units.filter((u) => !u.hidden)
    if (selIds.length === 0) return { list: visible, full: false }
    const set = new Set(selIds)
    return { list: visible.filter((u) => set.has(u.id)), full: true }
  }, [units, selIds])

  if (!show) return null

  // в «Плане» габариты и контуры пятен рисует PlanOverlay — дублировать нельзя,
  // иначе поверх чертежа ложится вторая пачка линий и плашек.
  // Зазоры между юнитами остаются: их PlanOverlay не считает, а для расстановки
  // это главное число на чертеже.
  return (
    <group name="dimensions">
      {!isPlan &&
        shown.list.map((u) => (
          <UnitDims key={u.id} unit={u} full={shown.full} color={colors.dim} />
        ))}
      <GapDims color={colors.dim} danger={colors.danger} top={isPlan} />
    </group>
  )
}
