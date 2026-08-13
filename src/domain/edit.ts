/**
 * Мутирующие операции редактирования каркаса и ячеек.
 * Пишутся под immer — функции меняют объект на месте.
 */

import type { Cell, CellKey, CellFill, ShelfUnit } from './types'
import { cellKey, parseCellKey } from './types'
import { coveredKeys, nCols, nRows } from './frame'

export const MIN_COL = 80
export const MAX_COL = 1600
export const MIN_ROW = 60
export const MAX_ROW = 1600
export const MIN_DEPTH = 100
export const MAX_DEPTH = 900

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function remapCells(
  u: ShelfUnit,
  mapKey: (c: number, r: number) => { c: number; r: number } | null,
  mapSpan?: (cell: Cell, c: number, r: number) => { c: number; r: number },
) {
  const next: Record<CellKey, Cell> = {}
  for (const [k, cell] of Object.entries(u.cells)) {
    const { c, r } = parseCellKey(k)
    const to = mapKey(c, r)
    if (!to) continue
    const span = mapSpan ? mapSpan(cell, c, r) : cell.span
    next[cellKey(to.c, to.r)] = { ...cell, span }
  }
  u.cells = next
}

// ── Колонки ─────────────────────────────────────────────────────────────────

export function insertColumn(u: ShelfUnit, index: number, width?: number) {
  const n = nCols(u.frame)
  const i = clamp(index, 0, n)
  const w = clamp(width ?? u.frame.cols[Math.min(i, n - 1)] ?? 400, MIN_COL, MAX_COL)
  u.frame.cols.splice(i, 0, w)
  remapCells(
    u,
    (c, r) => ({ c: c >= i ? c + 1 : c, r }),
    (cell, c) => (c < i && c + cell.span.c - 1 >= i ? { ...cell.span, c: cell.span.c + 1 } : cell.span),
  )
}

export function removeColumn(u: ShelfUnit, index: number) {
  const n = nCols(u.frame)
  if (n <= 1) return
  const i = clamp(index, 0, n - 1)
  u.frame.cols.splice(i, 1)
  remapCells(
    u,
    (c, r) => (c === i ? null : { c: c > i ? c - 1 : c, r }),
    (cell, c) =>
      c < i && c + cell.span.c - 1 >= i ? { ...cell.span, c: Math.max(1, cell.span.c - 1) } : cell.span,
  )
  normalizeCells(u)
}

export function setColWidth(u: ShelfUnit, index: number, width: number) {
  if (index < 0 || index >= u.frame.cols.length) return
  u.frame.cols[index] = clamp(Math.round(width), MIN_COL, MAX_COL)
}

export function distributeColumns(u: ShelfUnit) {
  const total = u.frame.cols.reduce((s, v) => s + v, 0)
  const n = u.frame.cols.length
  if (!n) return
  const each = clamp(Math.round(total / n), MIN_COL, MAX_COL)
  u.frame.cols = u.frame.cols.map(() => each)
}

// ── Ряды ────────────────────────────────────────────────────────────────────

export function insertRow(u: ShelfUnit, index: number, height?: number) {
  const n = nRows(u.frame)
  const i = clamp(index, 0, n)
  const h = clamp(height ?? u.frame.rows[Math.min(i, n - 1)] ?? 360, MIN_ROW, MAX_ROW)
  u.frame.rows.splice(i, 0, h)
  remapCells(
    u,
    (c, r) => ({ c, r: r >= i ? r + 1 : r }),
    (cell, _c, r) => (r < i && r + cell.span.r - 1 >= i ? { ...cell.span, r: cell.span.r + 1 } : cell.span),
  )
}

export function removeRow(u: ShelfUnit, index: number) {
  const n = nRows(u.frame)
  if (n <= 1) return
  const i = clamp(index, 0, n - 1)
  u.frame.rows.splice(i, 1)
  remapCells(
    u,
    (c, r) => (r === i ? null : { c, r: r > i ? r - 1 : r }),
    (cell, _c, r) =>
      r < i && r + cell.span.r - 1 >= i ? { ...cell.span, r: Math.max(1, cell.span.r - 1) } : cell.span,
  )
  normalizeCells(u)
}

export function setRowHeight(u: ShelfUnit, index: number, height: number) {
  if (index < 0 || index >= u.frame.rows.length) return
  u.frame.rows[index] = clamp(Math.round(height), MIN_ROW, MAX_ROW)
}

export function distributeRows(u: ShelfUnit) {
  const total = u.frame.rows.reduce((s, v) => s + v, 0)
  const n = u.frame.rows.length
  if (!n) return
  const each = clamp(Math.round(total / n), MIN_ROW, MAX_ROW)
  u.frame.rows = u.frame.rows.map(() => each)
}

// ── Ячейки ──────────────────────────────────────────────────────────────────

export function setCellFill(u: ShelfUnit, key: CellKey, fill: CellFill) {
  const prev = u.cells[key]
  u.cells[key] = { span: prev?.span ?? { c: 1, r: 1 }, material: prev?.material, back: prev?.back, fill }
}

export function patchCell(u: ShelfUnit, key: CellKey, patch: Partial<Cell>) {
  const prev = u.cells[key] ?? { fill: { t: 'empty' as const }, span: { c: 1, r: 1 } }
  u.cells[key] = { ...prev, ...patch }
}

export function clearCell(u: ShelfUnit, key: CellKey) {
  delete u.cells[key]
}

/** Объединяет прямоугольную область, охватывающую обе ячейки */
export function mergeCells(u: ShelfUnit, a: CellKey, b: CellKey) {
  const A = parseCellKey(a)
  const B = parseCellKey(b)
  const cellA = u.cells[a]
  const cellB = u.cells[b]
  const c0 = Math.min(A.c, B.c)
  const r0 = Math.min(A.r, B.r)
  const c1 = Math.max(A.c + (cellA?.span.c ?? 1) - 1, B.c + (cellB?.span.c ?? 1) - 1)
  const r1 = Math.max(A.r + (cellA?.span.r ?? 1) - 1, B.r + (cellB?.span.r ?? 1) - 1)

  const keep = u.cells[cellKey(c0, r0)] ?? cellA ?? cellB ?? { fill: { t: 'empty' as const }, span: { c: 1, r: 1 } }
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) delete u.cells[cellKey(c, r)]
  }
  u.cells[cellKey(c0, r0)] = { ...keep, span: { c: c1 - c0 + 1, r: r1 - r0 + 1 } }
}

export function splitCell(u: ShelfUnit, key: CellKey) {
  const cell = u.cells[key]
  if (!cell) return
  u.cells[key] = { ...cell, span: { c: 1, r: 1 } }
}

/** Обрезает span-ы по границам сетки, выкидывает ключи вне диапазона и конфликты */
export function normalizeCells(u: ShelfUnit) {
  const nc = nCols(u.frame)
  const nr = nRows(u.frame)
  const next: Record<CellKey, Cell> = {}
  for (const [k, cell] of Object.entries(u.cells)) {
    const { c, r } = parseCellKey(k)
    if (!Number.isFinite(c) || !Number.isFinite(r)) continue
    if (c < 0 || r < 0 || c >= nc || r >= nr) continue
    next[k] = {
      ...cell,
      span: {
        c: clamp(cell.span?.c ?? 1, 1, nc - c),
        r: clamp(cell.span?.r ?? 1, 1, nr - r),
      },
    }
  }
  u.cells = next
  // выкидываем ячейки, поглощённые чужим span-ом
  const tmp: ShelfUnit = { ...u, cells: next }
  const covered = coveredKeys(tmp)
  for (const k of covered) delete u.cells[k]
}

/** Залить все ячейки одним типом (учитывая объединения) */
export function fillAllCells(u: ShelfUnit, fill: CellFill) {
  const nc = nCols(u.frame)
  const nr = nRows(u.frame)
  const covered = coveredKeys(u)
  for (let c = 0; c < nc; c++) {
    for (let r = 0; r < nr; r++) {
      const k = cellKey(c, r)
      if (covered.has(k)) continue
      setCellFill(u, k, fill)
    }
  }
}

export function clearAllCells(u: ShelfUnit) {
  const spans: Record<CellKey, Cell> = {}
  for (const [k, cell] of Object.entries(u.cells)) {
    if (cell.span.c > 1 || cell.span.r > 1) spans[k] = { ...cell, fill: { t: 'empty' } }
  }
  u.cells = spans
}

/** Зеркалит наполнение по горизонтали */
export function mirrorCells(u: ShelfUnit) {
  const nc = nCols(u.frame)
  const next: Record<CellKey, Cell> = {}
  for (const [k, cell] of Object.entries(u.cells)) {
    const { c, r } = parseCellKey(k)
    const nc2 = nc - c - cell.span.c
    let fill = cell.fill
    if (fill.t === 'door' && (fill.hinge === 'left' || fill.hinge === 'right')) {
      fill = { ...fill, hinge: fill.hinge === 'left' ? 'right' : 'left' }
    }
    next[cellKey(nc2, r)] = { ...cell, fill }
  }
  u.cells = next
  u.frame.cols = [...u.frame.cols].reverse()
  normalizeCells(u)
}
