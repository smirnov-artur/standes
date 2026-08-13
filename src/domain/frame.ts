/**
 * Чистая размерная математика каркаса. Единственный источник правды о том,
 * ГДЕ что находится. И geometry.ts (детали), и anchors.ts (магниты),
 * и UI-инспектор считают по этим функциям — расхождений быть не может.
 *
 * Все координаты — локальные, мм. Origin = центр пятна застройки на полу.
 *   X: -W/2 … +W/2   Y: 0 … H   Z: -D/2 (зад) … +D/2 (перёд)
 */

import type { Cell, CellKey, CellRect, FrameSpec, RetailSpec, ShelfUnit, Vec2, Vec3 } from './types'
import { DEFAULT_CELL, cellKey, parseCellKey } from './types'

export interface Span {
  a: number
  b: number
}

/**
 * Эффективные толщины. Для стального каркаса и боковины, и перегородки —
 * это профиль, поэтому вся размерная сетка считается одинаково для обоих стилей.
 */
export function effThickness(f: FrameSpec): { side: number; panel: number } {
  // и стальной каркас, и торговый стеллаж строятся на профиле:
  // боковина — это стойка, а «полка» по сетке — её посадочное место
  if (f.style === 'steel-frame') return { side: f.profile, panel: f.profile }
  if (f.style === 'retail') return { side: f.profile, panel: RETAIL_SLOT }
  return { side: f.side, panel: f.panel }
}

/**
 * Толщина посадочного места полки в торговом стеллаже, мм.
 * Полка висит на кронштейнах, поэтому «съедает» по высоте не свою толщину,
 * а зазор под кронштейн — он и задаёт шаг перфорации.
 */
export const RETAIL_SLOT = 25

/** Дефолты торгового стеллажа — по ним добиваются недостающие поля */
export const DEFAULT_RETAIL: RetailSpec = {
  baseHeight: 120,
  shelfDepth: 400,
  tilt: 0,
  lip: 25,
  priceRail: true,
  perforated: true,
  island: false,
  header: 0,
}

/**
 * Полные параметры торгового стеллажа с добитыми дефолтами.
 * Глубина полок зажимается глубиной базы: полка не может торчать вперёд
 * дальше базы, иначе стеллаж перевернётся.
 */
export function retailSpec(f: FrameSpec): RetailSpec {
  /*
   * Глубина полок ПО УМОЛЧАНИЮ равна глубине базы — низ не выступает.
   * Ступенька (база глубже полок) у торговых гондол встречается, но как
   * осознанный выбор под тяжёлый товар, а не как поведение по умолчанию:
   * выступающий на десять сантиметров низ читается как ошибка сборки.
   * Кто хочет ступеньку — задаёт shelfDepth меньше depth явно.
   */
  const r = { ...DEFAULT_RETAIL, shelfDepth: f.depth, ...(f.retail ?? {}) }
  return {
    ...r,
    baseHeight: Math.max(0, Math.min(r.baseHeight, 600)),
    shelfDepth: Math.max(120, Math.min(r.shelfDepth, f.depth)),
    tilt: Math.max(0, Math.min(r.tilt, 15)),
    lip: Math.max(0, Math.min(r.lip, 120)),
    header: Math.max(0, Math.min(r.header, 400)),
  }
}

export function effFootHeight(f: FrameSpec): number {
  return f.feet === 'none' ? 0 : Math.max(0, f.footHeight)
}

export function effBackThickness(f: FrameSpec): number {
  return f.back === 'none' ? 0 : Math.max(0, f.backThickness)
}

export function nCols(f: FrameSpec): number {
  return f.cols.length
}
export function nRows(f: FrameSpec): number {
  return f.rows.length
}

/** Внешняя ширина корпуса (без свеса столешницы) */
export function outerWidth(f: FrameSpec): number {
  const { side, panel } = effThickness(f)
  const n = f.cols.length
  if (n === 0) return side * 2
  return side * 2 + f.cols.reduce((s, w) => s + w, 0) + panel * (n - 1)
}

/** Высота одного корпуса без ножек */
export function bodyHeight(f: FrameSpec): number {
  const { side, panel } = effThickness(f)
  const n = f.rows.length
  if (n === 0) return side * 2
  return side * 2 + f.rows.reduce((s, h) => s + h, 0) + panel * (n - 1)
}

/** Полная внешняя высота с ножками/цоколем */
export function outerHeight(f: FrameSpec): number {
  return effFootHeight(f) + bodyHeight(f)
}

/** Внешние габариты корпуса (свес столешницы НЕ учитывается) */
export function outerSize(f: FrameSpec): Vec3 {
  return { x: outerWidth(f), y: outerHeight(f), z: f.depth }
}

// ────────────────────────────────────────────────────────────────────────────
//  Высота установки (штабелирование)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Потолок штабеля, мм. Выше человек стеллаж не поставит и не снимет,
 * да и комнаты такой высоты не бывает — заодно страхует от мусора в ссылке.
 */
export const MAX_ELEVATION = 6000

/**
 * Высота НИЗА юнита над полом, мм. Единственный законный способ прочитать
 * ShelfUnit.elevation: поле необязательное (старые проекты его не знают),
 * а мусор из ссылки или из ручного ввода здесь же зажимается в [0, MAX_ELEVATION].
 */
export function elevationOf(u: ShelfUnit): number {
  const e = u.elevation
  if (typeof e !== 'number' || !Number.isFinite(e)) return 0
  return Math.max(0, Math.min(e, MAX_ELEVATION))
}

/** Высота КРЫШКИ юнита над полом, мм — на неё встаёт следующий этаж штабеля */
export function unitTopY(u: ShelfUnit): number {
  return elevationOf(u) + outerSize(u.frame).y
}

/** Чистые проёмы колонок по X (слева направо) */
export function colSpans(f: FrameSpec): Span[] {
  const { side, panel } = effThickness(f)
  const W = outerWidth(f)
  const out: Span[] = []
  let x = -W / 2 + side
  for (let i = 0; i < f.cols.length; i++) {
    out.push({ a: x, b: x + f.cols[i] })
    x += f.cols[i] + panel
  }
  return out
}

/** Вертикальные элементы: 0 = левая боковина, последний = правая, между — перегородки */
export function verticalSpans(f: FrameSpec): Span[] {
  const { side, panel } = effThickness(f)
  const W = outerWidth(f)
  const spans = colSpans(f)
  const out: Span[] = [{ a: -W / 2, b: -W / 2 + side }]
  for (let i = 0; i < spans.length - 1; i++) out.push({ a: spans[i].b, b: spans[i].b + panel })
  out.push({ a: W / 2 - side, b: W / 2 })
  return out
}

/** Чистые проёмы рядов по Y (СНИЗУ ВВЕРХ) */
export function rowSpans(f: FrameSpec): Span[] {
  const { side, panel } = effThickness(f)
  const out: Span[] = []
  let y = effFootHeight(f) + side
  for (let i = 0; i < f.rows.length; i++) {
    out.push({ a: y, b: y + f.rows[i] })
    y += f.rows[i] + panel
  }
  return out
}

/** Горизонтальные элементы: 0 = дно, последний = крышка, между — полки */
export function horizontalSpans(f: FrameSpec): Span[] {
  const { side, panel } = effThickness(f)
  const H = outerHeight(f)
  const spans = rowSpans(f)
  const out: Span[] = [{ a: effFootHeight(f), b: effFootHeight(f) + side }]
  for (let i = 0; i < spans.length - 1; i++) out.push({ a: spans[i].b, b: spans[i].b + panel })
  out.push({ a: H - side, b: H })
  return out
}

/** Диапазоны по Z: задняя стенка, внутреннее пространство, плоскость фасада */
export function zRanges(f: FrameSpec) {
  const D = f.depth
  const bt = effBackThickness(f)
  return {
    back: bt > 0 ? { a: -D / 2, b: -D / 2 + bt } : null,
    inner: { a: -D / 2 + bt, b: D / 2 },
    frontPlane: D / 2,
    backPlane: -D / 2,
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Ячейки
// ────────────────────────────────────────────────────────────────────────────

export function getCell(u: ShelfUnit, key: CellKey): Cell {
  return u.cells[key] ?? DEFAULT_CELL
}

/** Ключи ячеек, поглощённых объединением (span) соседа-мастера */
export function coveredKeys(u: ShelfUnit): Set<CellKey> {
  const covered = new Set<CellKey>()
  const nc = nCols(u.frame)
  const nr = nRows(u.frame)
  for (let c = 0; c < nc; c++) {
    for (let r = 0; r < nr; r++) {
      const k = cellKey(c, r)
      if (covered.has(k)) continue
      const cell = u.cells[k]
      if (!cell) continue
      const sc = Math.max(1, Math.min(cell.span.c, nc - c))
      const sr = Math.max(1, Math.min(cell.span.r, nr - r))
      if (sc === 1 && sr === 1) continue
      for (let dc = 0; dc < sc; dc++) {
        for (let dr = 0; dr < sr; dr++) {
          if (dc === 0 && dr === 0) continue
          covered.add(cellKey(c + dc, r + dr))
        }
      }
    }
  }
  return covered
}

/**
 * Прямоугольники видимых ячеек в локальных координатах.
 * Объединённая ячейка «съедает» разделяющие её перегородки и полки,
 * поэтому её проём считается от начала первой до конца последней.
 */
export function cellRects(u: ShelfUnit): { rects: CellRect[]; covered: Set<CellKey> } {
  const f = u.frame
  const cs = colSpans(f)
  const rs = rowSpans(f)
  const z = zRanges(f)
  const covered = coveredKeys(u)
  const nc = nCols(f)
  const nr = nRows(f)
  const rects: CellRect[] = []

  for (let c = 0; c < nc; c++) {
    for (let r = 0; r < nr; r++) {
      const k = cellKey(c, r)
      if (covered.has(k)) continue
      const cell = getCell(u, k)
      const sc = Math.max(1, Math.min(cell.span.c, nc - c))
      const sr = Math.max(1, Math.min(cell.span.r, nr - r))
      rects.push({
        key: k,
        c,
        r,
        span: { c: sc, r: sr },
        x0: cs[c].a,
        x1: cs[c + sc - 1].b,
        y0: rs[r].a,
        y1: rs[r + sr - 1].b,
        z0: z.inner.a,
        z1: z.inner.b,
        cell,
      })
    }
  }
  return { rects, covered }
}

/**
 * Внутренние вертикальные перегородки, которые НЕ должны рисоваться,
 * потому что их «съела» объединённая ячейка.
 * Индексация как в verticalSpans: 0 = левая боковина … n = правая.
 */
export function suppressedVerticals(u: ShelfUnit): Set<string> {
  const out = new Set<string>()
  const { rects } = cellRects(u)
  for (const rect of rects) {
    if (rect.span.c <= 1) continue
    for (let i = 1; i < rect.span.c; i++) {
      // перегородка с индексом rect.c + i перекрыта на рядах rect.r … rect.r+span.r-1
      for (let r = rect.r; r < rect.r + rect.span.r; r++) out.add(`${rect.c + i}@${r}`)
    }
  }
  return out
}

/**
 * Внутренние полки, съеденные объединением по вертикали.
 * Индексация как в horizontalSpans: 0 = дно … n = крышка.
 */
export function suppressedHorizontals(u: ShelfUnit): Set<string> {
  const out = new Set<string>()
  const { rects } = cellRects(u)
  for (const rect of rects) {
    if (rect.span.r <= 1) continue
    for (let i = 1; i < rect.span.r; i++) {
      for (let c = rect.c; c < rect.c + rect.span.c; c++) out.add(`${rect.r + i}@${c}`)
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
//  Мир ↔ локальные координаты
// ────────────────────────────────────────────────────────────────────────────

export function toWorld(u: ShelfUnit, local: Vec2): Vec2 {
  const cos = Math.cos(u.rotY)
  const sin = Math.sin(u.rotY)
  return {
    x: u.pos.x + local.x * cos + local.z * sin,
    z: u.pos.z - local.x * sin + local.z * cos,
  }
}

export function toLocal(u: ShelfUnit, world: Vec2): Vec2 {
  const dx = world.x - u.pos.x
  const dz = world.z - u.pos.z
  const cos = Math.cos(u.rotY)
  const sin = Math.sin(u.rotY)
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
}

/**
 * Углы пятна застройки в мире, по часовой стрелке, начиная с задне-левого:
 * 0 = back-left, 1 = back-right, 2 = front-right, 3 = front-left.
 */
export function footprintCorners(u: ShelfUnit): [Vec2, Vec2, Vec2, Vec2] {
  const { x: W, z: D } = outerSize(u.frame)
  const hw = W / 2
  const hd = D / 2
  return [
    toWorld(u, { x: -hw, z: -hd }),
    toWorld(u, { x: hw, z: -hd }),
    toWorld(u, { x: hw, z: hd }),
    toWorld(u, { x: -hw, z: hd }),
  ]
}

/** Осевой bounding box пятна застройки в мире, мм */
export function footprintAABB(u: ShelfUnit): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const cs = footprintCorners(u)
  return {
    minX: Math.min(...cs.map((c) => c.x)),
    maxX: Math.max(...cs.map((c) => c.x)),
    minZ: Math.min(...cs.map((c) => c.z)),
    maxZ: Math.max(...cs.map((c) => c.z)),
  }
}

/** Нормализация угла в (-π, π] */
export function normAngle(a: number): number {
  let x = a % (Math.PI * 2)
  if (x > Math.PI) x -= Math.PI * 2
  if (x <= -Math.PI) x += Math.PI * 2
  return x
}

/** Кратчайшая разница углов */
export function angleDelta(a: number, b: number): number {
  return normAngle(a - b)
}

export { cellKey, parseCellKey }
