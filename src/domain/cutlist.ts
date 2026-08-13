/**
 * Раскрой листовых деталей — гильотинный алгоритм со списком свободных
 * прямоугольников и выбором по Best Area Fit.
 *
 * Гильотина (а не полноценный MaxRects) выбрана осознанно: рез форматника
 * всегда сквозной, поэтому схема, которую нельзя распилить насквозь,
 * на производстве бесполезна. Свободные прямоугольники не пересекаются —
 * список не нужно чистить, а раскладка получается воспроизводимой.
 */

import type { CutPiece, CutSheet, CutlistResult, MaterialDef, ShelfUnit } from '@/domain/types'
import { getMaterial, materialName } from '@/domain/materials'
import { getUnitGeometry } from '@/domain/geometry'

export interface CutOpts {
  /** ширина пропила, мм */
  kerf?: number
  /** учитывать направление текстуры: для дерева запрещает разворот на 90° */
  grainAware?: boolean
  /** обрезка кромки листа со всех сторон, мм */
  margin?: number
}

/** Защита UI от зависания на абсурдных проектах */
const MAX_SHEETS = 400
const MAX_PIECES = 5000
/** Огрызки мельче не храним — только раздувают список */
const MIN_FREE = 8
const EPS = 1e-6

// ────────────────────────────────────────────────────────────────────────────

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Item {
  id: string
  label: string
  w: number
  h: number
  area: number
}

interface Bin {
  sheet: CutSheet
  free: Rect[]
  used: number
}

interface Group {
  key: string
  material: MaterialDef
  thickness: number
  items: Item[]
}

/** Текстура вдоль длинной стороны — разворачивать нельзя */
const isGrainy = (m: MaterialDef): boolean => m.texture === 'wood' || m.texture === 'ply-edge'

// ────────────────────────────────────────────────────────────────────────────
//  Сбор деталей
// ────────────────────────────────────────────────────────────────────────────

function collect(units: ShelfUnit[]): Group[] {
  const groups = new Map<string, Group>()
  const named = units.length > 1

  for (const unit of units) {
    for (const p of getUnitGeometry(unit).parts) {
      if (!p.cut) continue
      const m = getMaterial(p.materialId)
      if (m.kind !== 'sheet' && m.kind !== 'glass') continue

      const w = Math.round(p.cut.w)
      const h = Math.round(p.cut.h)
      if (!(w > 0) || !(h > 0)) continue
      const t = Math.round(p.cut.t * 10) / 10

      const key = `${m.id}|${t}`
      let g = groups.get(key)
      if (!g) {
        g = { key, material: m, thickness: t, items: [] }
        groups.set(key, g)
      }
      g.items.push({
        id: `${unit.id}:${p.id}`,
        label: named ? `${unit.name} · ${p.label}` : p.label,
        w,
        h,
        area: w * h,
      })
    }
  }

  // крупные детали первыми: сначала по длинной стороне, затем по площади
  for (const g of groups.values()) {
    g.items.sort(
      (a, b) =>
        Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.area - a.area || a.id.localeCompare(b.id),
    )
  }

  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// ────────────────────────────────────────────────────────────────────────────
//  Размещение
// ────────────────────────────────────────────────────────────────────────────

/**
 * Гильотинный рез по короткой оси остатка: после детали (cw × ch)
 * в прямоугольнике остаётся два непересекающихся куска.
 */
function split(rect: Rect, cw: number, ch: number, out: Rect[]) {
  const leftW = rect.w - cw
  const leftH = rect.h - ch
  const push = (x: number, y: number, w: number, h: number) => {
    if (w >= MIN_FREE && h >= MIN_FREE) out.push({ x, y, w, h })
  }
  if (leftW < leftH) {
    // рез горизонтальный: верх остаётся на всю ширину
    push(rect.x + cw, rect.y, leftW, ch)
    push(rect.x, rect.y + ch, rect.w, leftH)
  } else {
    // рез вертикальный: правый кусок остаётся на всю высоту
    push(rect.x + cw, rect.y, leftW, rect.h)
    push(rect.x, rect.y + ch, cw, leftH)
  }
}

interface Spot {
  bin: Bin
  index: number
  rect: Rect
  w: number
  h: number
  rotated: boolean
  waste: number
}

/**
 * Лучшее место для детали среди всех открытых листов группы.
 * Критерий — минимальный остаток площади (Best Area Fit), при равенстве
 * берём прямоугольник ниже и левее.
 *
 * Пропил при проверке влезания не добавляем: деталь, легшую вплотную
 * к краю остатка, пилить уже не нужно. Kerf съедается при нарезке остатка.
 */
function findSpot(bins: Bin[], it: Item, rotatable: boolean): Spot | null {
  let best: Spot | null = null
  const options: [number, number, boolean][] =
    rotatable && it.w !== it.h
      ? [
          [it.w, it.h, false],
          [it.h, it.w, true],
        ]
      : [[it.w, it.h, false]]

  for (const bin of bins) {
    for (let i = 0; i < bin.free.length; i++) {
      const rect = bin.free[i]
      for (const [w, h, rotated] of options) {
        if (w > rect.w + EPS || h > rect.h + EPS) continue
        const waste = rect.w * rect.h - w * h
        const better =
          !best ||
          waste < best.waste - EPS ||
          (waste <= best.waste + EPS &&
            (rect.y < best.rect.y || (rect.y === best.rect.y && rect.x < best.rect.x)))
        if (better) best = { bin, index: i, rect, w, h, rotated, waste }
      }
    }
  }
  return best
}

function put(spot: Spot, it: Item, kerf: number, margin: number) {
  const rect = spot.rect
  const piece: CutPiece = {
    id: it.id,
    label: it.label,
    // w × h — как деталь легла на лист; rotated говорит, что она повёрнута
    w: spot.w,
    h: spot.h,
    x: rect.x + margin,
    y: rect.y + margin,
    rotated: spot.rotated,
  }
  spot.bin.sheet.pieces.push(piece)
  spot.bin.used += it.area

  const rest: Rect[] = []
  split(rect, Math.min(rect.w, spot.w + kerf), Math.min(rect.h, spot.h + kerf), rest)
  spot.bin.free.splice(spot.index, 1, ...rest)
}

// ────────────────────────────────────────────────────────────────────────────
//  Главная функция
// ────────────────────────────────────────────────────────────────────────────

export function computeCutlist(units: ShelfUnit[], opts: CutOpts = {}): CutlistResult {
  const kerf = Math.max(0, opts.kerf ?? 4)
  const margin = Math.max(0, opts.margin ?? 10)
  const grainAware = opts.grainAware ?? false

  const groups = collect(units.filter((u) => !u.hidden))
  const sheets: CutSheet[] = []
  const unplaced: CutlistResult['unplaced'] = []
  let placed = 0

  for (const g of groups) {
    const m = g.material
    const usableW = m.sheet.w - margin * 2
    const usableH = m.sheet.h - margin * 2
    const bins: Bin[] = []
    const grainy = grainAware && isGrainy(m)

    for (const it of g.items) {
      if (placed >= MAX_PIECES) {
        unplaced.push({ label: it.label, w: it.w, h: it.h })
        continue
      }

      const fitsFlat = it.w <= usableW + EPS && it.h <= usableH + EPS
      const fitsTurned = it.h <= usableW + EPS && it.w <= usableH + EPS
      if (!fitsFlat && !fitsTurned) {
        unplaced.push({ label: it.label, w: it.w, h: it.h })
        continue
      }
      // текстуру бережём, но если деталь физически не ложится вдоль листа —
      // разворачиваем: пустая строка в раскрое хуже развёрнутой текстуры
      const rotatable = !grainy || !fitsFlat

      let spot = findSpot(bins, it, rotatable)
      if (!spot) {
        if (sheets.length + bins.length >= MAX_SHEETS) {
          unplaced.push({ label: it.label, w: it.w, h: it.h })
          continue
        }
        const bin: Bin = {
          sheet: {
            index: 0,
            materialId: m.id,
            // на языке сборки: карта раскроя и её CSV уезжают в цех
            materialName: materialName(m),
            w: m.sheet.w,
            h: m.sheet.h,
            thickness: g.thickness,
            pieces: [],
            usage: 0,
          },
          free: [{ x: 0, y: 0, w: usableW, h: usableH }],
          used: 0,
        }
        bins.push(bin)
        spot = findSpot([bin], it, rotatable)
        if (!spot) {
          unplaced.push({ label: it.label, w: it.w, h: it.h })
          continue
        }
      }

      put(spot, it, kerf, margin)
      placed += 1
    }

    const sheetArea = m.sheet.w * m.sheet.h
    for (const bin of bins) {
      bin.sheet.usage = sheetArea > 0 ? Math.min(1, Math.max(0, bin.used / sheetArea)) : 0
      bin.sheet.usage = Math.round(bin.sheet.usage * 1e4) / 1e4
      bin.sheet.index = sheets.length
      sheets.push(bin.sheet)
    }
  }

  const totalUsed = sheets.reduce((s, sh) => s + sh.usage * sh.w * sh.h, 0)
  const totalArea = sheets.reduce((s, sh) => s + sh.w * sh.h, 0)

  return {
    sheets,
    unplaced,
    totalSheets: sheets.length,
    averageUsage: totalArea > 0 ? Math.round((totalUsed / totalArea) * 1e4) / 1e4 : 0,
  }
}
