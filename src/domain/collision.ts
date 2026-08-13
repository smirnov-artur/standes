/**
 * Пересечения юнитов: пятно застройки (XZ) плюс диапазон высот (Y).
 *
 * В плане работаем с повёрнутыми прямоугольниками (OBB) через SAT, по высоте —
 * простым перекрытием отрезков [elevationOf(u), unitTopY(u)]. Пересечением
 * считается ТОЛЬКО одновременное перекрытие и в плане, и по высоте: стеллаж,
 * стоящий НА другом, лежит на его крышке и пересечением быть не должен.
 *
 * Все величины — в МИЛЛИМЕТРАХ. Геометрия берётся только из frame.ts.
 *
 * Комната: внутренние стены по X от -room.width/2 до +room.width/2,
 *          по Z от -room.depth/2 до +room.depth/2.
 */

import type { Room, ShelfUnit, Vec2 } from './types'
import { elevationOf, footprintAABB, footprintCorners, outerSize, unitTopY } from './frame'

/**
 * Зазор по умолчанию, мм. «Отрицательный зазор»: перекрытие должно быть
 * СТРОГО больше tol, поэтому касание гранями пересечением не считается.
 */
export const COLLIDE_TOL = 2

// ── векторная мелочь ────────────────────────────────────────────────────────

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })
const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ── пятно застройки ─────────────────────────────────────────────────────────

/** 4 угла пятна в мире: 0 = back-left, 1 = back-right, 2 = front-right, 3 = front-left */
export function obbCorners(u: ShelfUnit): Vec2[] {
  return footprintCorners(u)
}

/**
 * Радиус описанной окружности пятна, мм. Не зависит от поворота,
 * поэтому годится для грубого отсева пар до дорогого SAT.
 */
export function footprintRadius(u: ShelfUnit): number {
  const s = outerSize(u.frame)
  return Math.hypot(s.x, s.z) / 2
}

/** Быстрый отсев по описанным окружностям: true — пересечение НЕВОЗМОЖНО */
export function farApart(a: ShelfUnit, b: ShelfUnit, slack = 0): boolean {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > footprintRadius(a) + footprintRadius(b) + slack
}

/** Оси разделения прямоугольника — направления двух его смежных сторон */
function rectAxes(c: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const e of [sub(c[1], c[0]), sub(c[3], c[0])]) {
    const len = Math.hypot(e.x, e.z)
    if (len > 1e-9) out.push({ x: e.x / len, z: e.z / len })
  }
  return out
}

function project(cs: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const c of cs) {
    const p = c.x * axis.x + c.z * axis.z
    if (p < min) min = p
    if (p > max) max = p
  }
  return { min, max }
}

/**
 * SAT по ГОТОВЫМ углам — без пересчёта тригонометрии.
 * Берутся оси обоих прямоугольников (по 2 уникальных на каждый = 4);
 * для прямоугольников направления сторон совпадают с нормалями, отдельные оси не нужны.
 * tol — глубина проникновения, которая ещё НЕ считается пересечением
 * (поэтому касание гранями проходит).
 */
export function obbOverlapCorners(ca: Vec2[], cb: Vec2[], tol = COLLIDE_TOL): boolean {
  const axes = [...rectAxes(ca), ...rectAxes(cb)]
  if (!axes.length) return false
  for (const axis of axes) {
    const pa = project(ca, axis)
    const pb = project(cb, axis)
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min)
    if (overlap <= tol) return false
  }
  return true
}

/**
 * Перекрытие ВЕРТИКАЛЬНЫХ диапазонов двух юнитов сверх допуска, мм.
 * 0 — юниты на разных этажах либо ровно касаются (верхний стоит на крышке
 * нижнего): tol здесь работает так же, как для граней в плане.
 */
export function verticalOverlap(a: ShelfUnit, b: ShelfUnit, tol = COLLIDE_TOL): number {
  const lo = Math.max(elevationOf(a), elevationOf(b))
  const hi = Math.min(unitTopY(a), unitTopY(b))
  return Math.max(0, hi - lo - tol)
}

/**
 * Полное (трёхмерное) пересечение двух юнитов: SAT по пятну И перекрытие высот.
 * tol — минимальная глубина проникновения, которая считается пересечением.
 *
 * Проверку высот делаем ПЕРВОЙ: она стоит две вычитаемых, а SAT — четыре проекции,
 * и в штабеле именно высота отсекает подавляющее большинство пар.
 */
export function obbOverlap(a: ShelfUnit, b: ShelfUnit, tol = COLLIDE_TOL): boolean {
  if (verticalOverlap(a, b, tol) <= 0) return false
  return obbOverlapCorners(obbCorners(a), obbCorners(b), tol)
}

/** id юнитов из others, с которыми пересекается u (в плане И по высоте) */
export function findCollisions(u: ShelfUnit, others: ShelfUnit[], tol = COLLIDE_TOL): string[] {
  const out: string[] = []
  // углы u считаем один раз, дальние пары отсекаем окружностями
  const cu = obbCorners(u)
  const ru = footprintRadius(u)
  for (const o of others) {
    if (o.id === u.id || o.hidden) continue
    if (verticalOverlap(u, o, tol) <= 0) continue
    if (Math.hypot(u.pos.x - o.pos.x, u.pos.z - o.pos.z) > ru + footprintRadius(o)) continue
    if (obbOverlapCorners(cu, obbCorners(o), tol)) out.push(o.id)
  }
  return out
}

// ── комната ─────────────────────────────────────────────────────────────────

/** Все 4 угла пятна внутри внутренних стен (с допуском tol наружу) */
export function insideRoom(u: ShelfUnit, room: Room, tol = 0): boolean {
  const hw = room.width / 2 + tol
  const hd = room.depth / 2 + tol
  for (const c of obbCorners(u)) {
    if (c.x < -hw || c.x > hw || c.z < -hd || c.z > hd) return false
  }
  return true
}

/**
 * Ближайшая позиция ЦЕНТРА пятна, при которой юнит целиком внутри комнаты.
 * Если юнит крупнее комнаты по какой-то оси — центрируется по этой оси.
 */
export function clampToRoom(u: ShelfUnit, room: Room): Vec2 {
  const bb = footprintAABB(u)
  // смещения габаритного бокса относительно центра (поворот уже учтён)
  const relMinX = bb.minX - u.pos.x
  const relMaxX = bb.maxX - u.pos.x
  const relMinZ = bb.minZ - u.pos.z
  const relMaxZ = bb.maxZ - u.pos.z

  const hw = room.width / 2
  const hd = room.depth / 2

  const loX = -hw - relMinX
  const hiX = hw - relMaxX
  const loZ = -hd - relMinZ
  const hiZ = hd - relMaxZ

  return {
    x: loX > hiX ? -(relMinX + relMaxX) / 2 : clampN(u.pos.x, loX, hiX),
    z: loZ > hiZ ? -(relMinZ + relMaxZ) / 2 : clampN(u.pos.z, loZ, hiZ),
  }
}

// ── площадь перекрытия ──────────────────────────────────────────────────────

function polygonArea(poly: Vec2[]): number {
  if (poly.length < 3) return 0
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.z - b.x * a.z
  }
  return Math.abs(s) / 2
}

/** Пересечение отрезка p1→p2 с бесконечной прямой s1→s2 */
function lineIntersect(p1: Vec2, p2: Vec2, s1: Vec2, s2: Vec2): Vec2 {
  const d1 = sub(p2, p1)
  const d2 = sub(s2, s1)
  const den = cross(d1, d2)
  if (Math.abs(den) < 1e-9) return { ...p1 }
  const t = cross(sub(s1, p1), d2) / den
  return { x: p1.x + d1.x * t, z: p1.z + d1.z * t }
}

/**
 * Площадь перекрытия двух пятен, мм² (Sutherland–Hodgman).
 * Углы из footprintCorners идут против часовой стрелки в осях (X, Z),
 * поэтому «внутри» = слева от ребра отсечения.
 */
export function overlapArea(a: ShelfUnit, b: ShelfUnit): number {
  let poly: Vec2[] = obbCorners(a)
  const clip = obbCorners(b)

  for (let i = 0; i < clip.length && poly.length; i++) {
    const s1 = clip[i]
    const s2 = clip[(i + 1) % clip.length]
    const edge = sub(s2, s1)
    const inside = (p: Vec2) => cross(edge, sub(p, s1)) >= 0

    const next: Vec2[] = []
    for (let j = 0; j < poly.length; j++) {
      const cur = poly[j]
      const prev = poly[(j - 1 + poly.length) % poly.length]
      const curIn = inside(cur)
      const prevIn = inside(prev)
      if (curIn) {
        if (!prevIn) next.push(lineIntersect(prev, cur, s1, s2))
        next.push(cur)
      } else if (prevIn) {
        next.push(lineIntersect(prev, cur, s1, s2))
      }
    }
    poly = next
  }
  return polygonArea(poly)
}
