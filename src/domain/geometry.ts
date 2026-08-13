/**
 * Разбор юнита на детали (Part[]).
 *
 * Это ядро приложения: по этому списку и рисуется сцена, и считается смета.
 * Вся размерная сетка берётся ТОЛЬКО из frame.ts — здесь никаких своих
 * пересчётов габаритов, только «что из чего сделано и где стоит».
 *
 * Единицы — миллиметры, оси локальные: X вправо, Y вверх, Z вперёд.
 */

import type {
  Cell,
  CellFill,
  CellKey,
  Part,
  PartMotion,
  PartRole,
  PartShape,
  ShelfUnit,
  UnitGeometry,
  Vec3,
  Warning,
} from '@/domain/types'
import {
  DEFAULT_RETAIL,
  bodyHeight,
  cellRects,
  colSpans,
  effBackThickness,
  effFootHeight,
  effThickness,
  horizontalSpans,
  outerHeight,
  outerSize,
  outerWidth,
  retailSpec,
  rowSpans,
  suppressedHorizontals,
  suppressedVerticals,
  verticalSpans,
  zRanges,
} from '@/domain/frame'
import { getMaterial } from '@/domain/materials'
import { t } from '@/i18n'

// ────────────────────────────────────────────────────────────────────────────
//  Константы построения
// ────────────────────────────────────────────────────────────────────────────

/** зазор между накладными фасадами, мм */
const FRONT_GAP = 3
/** минимально допустимый габарит детали (страховка от вырожденной геометрии) */
const MIN_SIZE = 0.5

/** цоколь: отступ от габарита корпуса */
const PLINTH_INSET_X = 40
const PLINTH_INSET_Z = 80
const PLINTH_SHIFT_Z = -20

const LEG_ROUND_D = 44
const LEG_ROUND_INSET = 70
const LEVELER_D = 32
const LEVELER_INSET = 45
const HAIRPIN_D = 12
const HAIRPIN_SPREAD = 0.42
const HAIRPIN_INSET = 40
const HAIRPIN_PLATE = 70
const HAIRPIN_PLATE_T = 6

/** ширина бруска рамы решётчатого фасада */
const SLAT_FRAME = 60
const SLAT_COUNT = 7

/** ящик: зазоры по глубине и ширине */
const DRAWER_BACK_GAP = 40
const DRAWER_SIDE_T = 15
/*
 * Короб ящика делают из фанеры или ЛДСП независимо от материала фасада:
 * никто не собирает выдвижной ящик из дуба под дубовым же фасадом.
 * Заодно это единственный материал в каталоге с толщиной 15 мм — иначе
 * царга уходила в раскрой как несуществующий «лист дуба 15 мм».
 */
const DRAWER_BOX_MATERIAL = 'birch-ply'
const DRAWER_SIDE_INSET = 20
const HANDLE_OUT = 28

const ROD_D = 25
const ROD_END_GAP = 10
const ROD_DROP = 70
const ROD_FLANGE_D = 34
const ROD_FLANGE_T = 8

const BOX_INSET_X = 24
const BOX_INSET_Y = 30
const BOX_INSET_Z = 30
const BOX_LIFT = 6

const DOOR_ANGLE = 1.92
const FLAP_ANGLE = 1.57

/*
 * Торговый (гондольный) стеллаж. Всё в мм; это толщины реального металла,
 * а не размерная сетка — сетка живёт в frame.ts (side = profile, panel = RETAIL_SLOT).
 */
/** номинальная толщина полки: гнутый лист, реальная берётся из каталога материала */
const RETAIL_SHELF_T = 12
/** кронштейн: толщина, высота, доля глубины полки */
const RETAIL_BRACKET_T = 3
const RETAIL_BRACKET_H = 55
const RETAIL_BRACKET_DEPTH = 0.8
/** отбортовка переднего края */
const RETAIL_LIP_T = 1.2
/** зазор между торцом полки и стойкой, мм — полка вкладная */
const RETAIL_SHELF_GAP = 1
/** ценникодержатель */
const RETAIL_RAIL_H = 39
const RETAIL_RAIL_T = 8
/** фронтальная панель базы */
const RETAIL_BASE_FRONT_T = 1.5
/** карниз */
const RETAIL_HEADER_T = 20

// ────────────────────────────────────────────────────────────────────────────
//  Мелкие хелперы
// ────────────────────────────────────────────────────────────────────────────

const clampDim = (v: number): number => (Number.isFinite(v) && v > MIN_SIZE ? v : MIN_SIZE)
const r1 = (v: number): number => Math.round(v * 10) / 10
const mid = (a: number, b: number): number => (a + b) / 2
const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)))

/** Листовые роли — попадают в раскрой (cut) */
const CUT_ROLES = new Set<PartRole>([
  'side',
  'top',
  'bottom',
  'divider',
  'shelf',
  'sub-shelf',
  'sub-divider',
  'back',
  'door',
  'drawer-front',
  'drawer-side',
  'drawer-bottom',
  'plinth',
  'box',
])

/** Кромка = передний торец по горизонтали (размер по X) */
const EDGE_BY_X = new Set<PartRole>(['top', 'bottom', 'shelf', 'sub-shelf'])
/** Кромка = передний торец по вертикали (размер по Y) */
const EDGE_BY_Y = new Set<PartRole>(['side', 'divider', 'sub-divider'])
/** Кромка по всему периметру */
const EDGE_PERIMETER = new Set<PartRole>(['door', 'drawer-front'])

/** Полка «на проверку прогиба»: пролёт МЕЖДУ ОПОРАМИ, а не длина доски */
interface SpanCheck {
  span: number
  t: number
  materialId: string
  cellKey?: CellKey
}

interface PartInput {
  id: string
  role: PartRole
  size: Vec3
  center: Vec3
  materialId: string
  label: string
  shape?: PartShape
  rot?: Vec3
  cellKey?: CellKey
  motion?: PartMotion
  /** явная длина кромки, мм — перекрывает правило по роли */
  edge?: number
  /** перфорированная деталь (стойка, задняя стенка торгового стеллажа) */
  perforated?: boolean
}

/** Толщина/ширина/высота листовой детали: t — наименьший габарит */
function sheetCut(size: Vec3): { w: number; h: number; t: number } {
  const d = [size.x, size.y, size.z].sort((a, b) => a - b)
  return { t: r1(d[0]), h: r1(d[1]), w: r1(d[2]) }
}

/**
 * Приводит толщину листовой детали к тому, что реально продают.
 *
 * Правило одностороннее: толщину можно только УМЕНЬШИТЬ до ближайшей каталожной.
 * Тогда деталь физически не может вылезти из своего гнезда в каркасе, а цех
 * получает раскрой из существующих листов. Если запрошенная толщина тоньше
 * самого тонкого листа — оставляем как есть, наращивать нельзя.
 *
 * Главный случай: стеклянная полка. Гнездо под полку рассчитано по frame.panel
 * (18 мм), но стекла такой толщины в полках не бывает — здесь оно становится
 * 10 мм, и масса витрины перестаёт быть завышенной вдвое.
 */
function buildableThickness(materialId: string, t: number): number {
  const list = getMaterial(materialId).thicknesses
  if (!list.length) return t
  let best = -Infinity
  for (const th of list) if (th <= t + 0.01 && th > best) best = th
  return Number.isFinite(best) ? best : t
}

/** Индекс самой тонкой оси — она и есть толщина листовой детали */
function thinAxis(size: Vec3): 'x' | 'y' | 'z' {
  if (size.x <= size.y && size.x <= size.z) return 'x'
  if (size.y <= size.z) return 'y'
  return 'z'
}

/** Сборка детали: добивает cut / edge / glass по роли и материалу */
function mkPart(p: PartInput): Part {
  const shape: PartShape = p.shape ?? 'box'
  const size: Vec3 = { x: clampDim(p.size.x), y: clampDim(p.size.y), z: clampDim(p.size.z) }

  // листовую деталь ужимаем до покупной толщины ДО того, как посчитаем cut,
  // иначе 3D и смета разъедутся
  if (shape === 'box' && CUT_ROLES.has(p.role)) {
    const axis = thinAxis(size)
    const real = buildableThickness(p.materialId, size[axis])
    if (real < size[axis] - 0.01) size[axis] = real
  }

  const part: Part = {
    id: p.id,
    role: p.role,
    shape,
    size,
    center: p.center,
    materialId: p.materialId,
    label: p.label,
  }
  if (p.rot) part.rot = p.rot
  if (p.perforated) part.perforated = true
  if (p.cellKey) part.cellKey = p.cellKey
  if (p.motion) part.motion = p.motion

  if (shape === 'box' && CUT_ROLES.has(p.role)) {
    const cut = sheetCut(size)
    part.cut = cut
    if (p.edge !== undefined) part.edge = r1(Math.max(0, p.edge))
    else if (EDGE_BY_X.has(p.role)) part.edge = r1(size.x)
    else if (EDGE_BY_Y.has(p.role)) part.edge = r1(size.y)
    else if (EDGE_PERIMETER.has(p.role)) part.edge = r1(2 * (cut.w + cut.h))
    else part.edge = 0
  }

  if (getMaterial(p.materialId).kind === 'glass') part.glass = true
  return part
}

/**
 * Непрерывные диапазоны индексов 0..n-1, разрезанные «пропущенными» позициями.
 * Используется и для сегментов полок по колонкам, и для перегородок по рядам.
 * `cut(i)` — дополнительный разрез ПЕРЕД индексом i (сквозная перегородка режет полку).
 */
function segments(
  n: number,
  skip: (i: number) => boolean,
  cut?: (i: number) => boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (skip(i)) {
      if (start >= 0) out.push([start, i - 1])
      start = -1
    } else if (start < 0) {
      start = i
    } else if (cut?.(i)) {
      out.push([start, i - 1])
      start = i
    }
  }
  if (start >= 0) out.push([start, n - 1])
  return out
}

/**
 * Страховка от битых данных (импорт проекта, старая ссылка, ручная правка JSON):
 * span обязан быть конечным целым >= 1, иначе frame.cellRects обратится к cs[NaN]
 * и уронит всю сцену исключением. Ячейки без fill выкидываем.
 * Юнит не мутируется: если всё в порядке — возвращается он же.
 */
function safeUnit(u: ShelfUnit): ShelfUnit {
  let dirty = false
  const cells: Record<CellKey, Cell> = {}
  for (const k of Object.keys(u.cells)) {
    const cell = u.cells[k] as Cell | undefined
    if (!cell || !cell.fill || typeof cell.fill.t !== 'string') {
      dirty = true
      continue
    }
    const c = clampInt(cell.span?.c ?? 1, 1, 999)
    const r = clampInt(cell.span?.r ?? 1, 1, 999)
    if (c !== cell.span?.c || r !== cell.span?.r) {
      dirty = true
      cells[k] = { ...cell, span: { c, r } }
    } else {
      cells[k] = cell
    }
  }
  return dirty ? { ...u, cells } : u
}

// ────────────────────────────────────────────────────────────────────────────
//  Ключ содержимого и мемоизация
// ────────────────────────────────────────────────────────────────────────────

function fillKey(f: CellFill): string {
  switch (f.t) {
    case 'shelves':
      return `sh:${f.count}`
    case 'dividers':
      return `dv:${f.count}`
    case 'drawers':
      return `dr:${f.count}:${f.front}`
    case 'door':
      return `do:${f.hinge}:${f.style}`
    case 'box':
      return `bx:${f.color ?? ''}`
    default:
      return f.t
  }
}

/** Стабильный ключ содержимого юнита: всё, что влияет на геометрию (без pos/rotY) */
export function geometryKey(unit: ShelfUnit): string {
  const f = unit.frame
  const m = unit.materials
  const cells = Object.keys(unit.cells)
    .sort()
    .map((k) => {
      const c = unit.cells[k]
      const back = c.back === undefined ? '' : c.back ? '1' : '0'
      return `${k}=${fillKey(c.fill)},${c.span.c}x${c.span.r},${c.material ?? ''},${back}`
    })
    .join(';')
  // параметры торгового стеллажа входят в ключ только для своего стиля:
  // иначе смена профиля retail сбрасывала бы кэш корпусных юнитов
  const rt = f.style === 'retail' ? retailSpec(f) : null
  return [
    f.style,
    // разделитель НЕ '.', иначе cols [1.2] и [1,2] дают один и тот же ключ
    f.cols.join(','),
    f.rows.join(','),
    f.depth,
    f.panel,
    f.side,
    f.back,
    f.backThickness,
    f.feet,
    f.footHeight,
    f.topOverhang,
    f.profile,
    f.braces ? 1 : 0,
    rt
      ? `${rt.baseHeight}_${rt.shelfDepth}_${rt.tilt}_${rt.lip}_${rt.priceRail ? 1 : 0}_${
          rt.perforated ? 1 : 0
        }_${rt.island ? 1 : 0}_${rt.header}`
      : '',
    m.carcass,
    m.shelf,
    m.back,
    m.front,
    m.accent,
    cells,
  ].join('/')
}

const MAX_CACHE = 200
const byUnit = new WeakMap<ShelfUnit, UnitGeometry>()
const byKey = new Map<string, UnitGeometry>()

/** Мемоизированный разбор: сперва по идентичности объекта, затем по ключу содержимого */
export function getUnitGeometry(unit: ShelfUnit): UnitGeometry {
  const direct = byUnit.get(unit)
  if (direct) return direct

  // warnings несут unitId, поэтому кэш разделён по юнитам
  const key = `${unit.id}|${geometryKey(unit)}`
  const cached = byKey.get(key)
  if (cached) {
    byKey.delete(key)
    byKey.set(key, cached) // LRU: освежаем
    byUnit.set(unit, cached)
    return cached
  }

  const geo = buildUnitGeometry(unit)
  byUnit.set(unit, geo)
  byKey.set(key, geo)
  if (byKey.size > MAX_CACHE) {
    const oldest = byKey.keys().next()
    if (!oldest.done) byKey.delete(oldest.value)
  }
  return geo
}

// ────────────────────────────────────────────────────────────────────────────
//  Построение
// ────────────────────────────────────────────────────────────────────────────

export function buildUnitGeometry(unit: ShelfUnit): UnitGeometry {
  const f = unit.frame
  const M = unit.materials

  const { side, panel } = effThickness(f)
  const fh = effFootHeight(f)
  const bh = bodyHeight(f)
  const bt = effBackThickness(f)
  const W = outerWidth(f)
  const H = outerHeight(f)
  const D = f.depth

  const cs = colSpans(f)
  const rs = rowSpans(f)
  const vs = verticalSpans(f)
  const hs = horizontalSpans(f)
  const z = zRanges(f)
  const innerZCenter = mid(z.inner.a, z.inner.b)
  const innerZSize = z.inner.b - z.inner.a

  // все обращения к сетке ячеек — через санированную копию
  const su = safeUnit(unit)
  const { rects, covered } = cellRects(su)
  const supV = suppressedVerticals(su)
  const supH = suppressedHorizontals(su)

  // Корзины — порядок деталей в итоговом массиве
  const frame: Part[] = []
  const back: Part[] = []
  const content: Part[] = []
  const fronts: Part[] = []
  const feet: Part[] = []
  const spanChecks: SpanCheck[] = []

  /**
   * Чистый пролёт полки-сегмента на прогиб: колонки, НЕ разделённые опорой снизу.
   * `rowBelow` — ряд под полкой; -1, если опор снизу нет вовсе (вкладная доска).
   */
  const clearSpan = (c0: number, c1: number, rowBelow: number): number => {
    let best = 0
    let run = 0
    for (let c = c0; c <= c1; c++) {
      if (c > c0) {
        // перегородка с индексом c стоит между колонками c-1 и c
        if (rowBelow >= 0 && !supV.has(`${c}@${rowBelow}`)) {
          best = Math.max(best, run)
          run = 0
        } else {
          run += panel
        }
      }
      run += f.cols[c] ?? 0
    }
    return Math.max(best, run)
  }

  if (f.style === 'retail') {
    // торговый стеллаж строит свою заднюю панель (она между стойками, а не
    // утоплена в корпус) и не имеет наполнения ячеек: дверей и ящиков
    // в магазинной гондоле не бывает
    buildRetail()
  } else {
    if (f.style === 'steel-frame') {
      buildSteel()
    } else {
      buildCarcass()
    }
    buildBack()
    buildCells()
  }
  buildFeet()

  // ── Корпусной каркас ──────────────────────────────────────────────────────
  function buildCarcass() {
    const ov = Math.max(0, f.topOverhang)
    const sideHeight = ov > 0 ? bh - side : bh

    for (const s of [-1, 1] as const) {
      frame.push(
        mkPart({
          id: s < 0 ? 'side-l' : 'side-r',
          role: 'side',
          size: { x: side, y: sideHeight, z: D },
          center: { x: s * (W / 2 - side / 2), y: fh + sideHeight / 2, z: 0 },
          materialId: M.carcass,
          label: s < 0 ? t('Боковина левая') : t('Боковина правая'),
        }),
      )
    }

    const h0 = hs[0]
    frame.push(
      mkPart({
        id: 'bottom',
        role: 'bottom',
        size: { x: W - 2 * side, y: h0.b - h0.a, z: D },
        center: { x: 0, y: mid(h0.a, h0.b), z: 0 },
        materialId: M.carcass,
        label: t('Дно'),
      }),
    )

    const hTop = hs[hs.length - 1]
    frame.push(
      mkPart({
        id: 'top',
        role: 'top',
        size: ov > 0 ? { x: W + 2 * ov, y: hTop.b - hTop.a, z: D + ov } : { x: W - 2 * side, y: hTop.b - hTop.a, z: D },
        center: { x: 0, y: mid(hTop.a, hTop.b), z: ov > 0 ? ov / 2 : 0 },
        materialId: M.carcass,
        label: ov > 0 ? t('Столешница') : t('Крышка'),
      }),
    )

    // Полки: по уровням, сегментами по колонкам.
    // Перегородка, проходящая сквозь уровень (есть и снизу, и сверху), режет полку —
    // иначе полка и перегородка пересекались бы объёмами.
    const dividerThrough = (i: number, level: number): boolean =>
      !supV.has(`${i}@${level - 1}`) && !supV.has(`${i}@${level}`)

    for (let i = 1; i <= hs.length - 2; i++) {
      const h = hs[i]
      for (const [c0, c1] of segments(
        cs.length,
        (c) => supH.has(`${i}@${c}`),
        (c) => dividerThrough(c, i),
      )) {
        frame.push(
          mkPart({
            id: `shelf-${i}-${c0}`,
            role: 'shelf',
            size: { x: cs[c1].b - cs[c0].a, y: h.b - h.a, z: innerZSize },
            center: { x: mid(cs[c0].a, cs[c1].b), y: mid(h.a, h.b), z: innerZCenter },
            materialId: M.shelf,
            label: t('Полка'),
          }),
        )
        spanChecks.push({ span: clearSpan(c0, c1, i - 1), t: h.b - h.a, materialId: M.shelf })
      }
    }

    // Перегородки: по внутренним вертикалям, сегментами по рядам
    for (let i = 1; i <= vs.length - 2; i++) {
      const v = vs[i]
      for (const [r0, r1x] of segments(rs.length, (r) => supV.has(`${i}@${r}`))) {
        frame.push(
          mkPart({
            id: `divider-${i}-${r0}`,
            role: 'divider',
            size: { x: v.b - v.a, y: rs[r1x].b - rs[r0].a, z: innerZSize },
            center: { x: mid(v.a, v.b), y: mid(rs[r0].a, rs[r1x].b), z: innerZCenter },
            materialId: M.carcass,
            label: t('Перегородка'),
          }),
        )
      }
    }
  }

  // ── Стальной каркас ───────────────────────────────────────────────────────
  function buildSteel() {
    const p = Math.max(1, f.profile)
    const bd = Math.min(f.panel, p * 1.2)

    // Стойки: по две (зад/перёд) на каждую вертикаль
    vs.forEach((v, i) => {
      for (const zs of [-1, 1] as const) {
        frame.push(
          mkPart({
            id: `post-${i}-${zs < 0 ? 'b' : 'f'}`,
            role: 'post',
            size: { x: v.b - v.a, y: bh, z: p },
            center: { x: mid(v.a, v.b), y: fh + bh / 2, z: zs * (D / 2 - p / 2) },
            materialId: M.carcass,
            label: t('Стойка'),
          }),
        )
      }
    })

    // Продольные царги по X — спереди и сзади на каждом уровне,
    // отрезками между стойками (сквозная царга протыкала бы промежуточные стойки)
    hs.forEach((h, i) => {
      cs.forEach((c, ci) => {
        for (const zs of [-1, 1] as const) {
          frame.push(
            mkPart({
              id: `rail-x-${i}-${ci}-${zs < 0 ? 'b' : 'f'}`,
              role: 'rail',
              size: { x: c.b - c.a, y: h.b - h.a, z: p },
              center: { x: mid(c.a, c.b), y: mid(h.a, h.b), z: zs * (D / 2 - p / 2) },
              materialId: M.carcass,
              label: t('Царга продольная'),
            }),
          )
        }
      })
    })

    // Поперечные царги по Z — только на крайних вертикалях
    const edgeV = [0, vs.length - 1]
    hs.forEach((h, i) => {
      for (const vi of edgeV) {
        const v = vs[vi]
        frame.push(
          mkPart({
            id: `rail-z-${i}-${vi}`,
            role: 'rail',
            size: { x: p, y: h.b - h.a, z: D - 2 * p },
            center: { x: mid(v.a, v.b), y: mid(h.a, h.b), z: 0 },
            materialId: M.carcass,
            label: t('Царга поперечная'),
          }),
        )
      }
    })

    // Вкладные доски — на каждом уровне, низом на horizontalSpans[i].a.
    // Доска ложится В СВЕТ рамки из царг: за x-границы проёма выходить нельзя,
    // иначе она протыкает поперечные царги и стойки.
    hs.forEach((h, i) => {
      for (const [c0, c1] of segments(cs.length, (c) => supH.has(`${i}@${c}`))) {
        const x0 = cs[c0].a
        const x1 = cs[c1].b
        frame.push(
          mkPart({
            id: `shelf-${i}-${c0}`,
            role: 'shelf',
            size: { x: x1 - x0, y: bd, z: D - 2 * p },
            center: { x: mid(x0, x1), y: h.a + bd / 2, z: 0 },
            materialId: M.shelf,
            label:
              i === 0
                ? t('Дно вкладное')
                : i === hs.length - 1
                  ? t('Крышка вкладная')
                  : t('Полка вкладная'),
          }),
        )
        // вкладная доска опирается только на царги по краям — пролёт равен всей доске
        spanChecks.push({ span: x1 - x0, t: bd, materialId: M.shelf })
      }
    })

    // Диагональные связи в задней плоскости
    if (f.braces) {
      const run = W - 2 * side
      const len = Math.hypot(run, bh)
      const ang = Math.atan2(bh, Math.max(1, run))
      for (const s of [-1, 1] as const) {
        frame.push(
          mkPart({
            id: s < 0 ? 'brace-a' : 'brace-b',
            role: 'brace',
            size: { x: len, y: p * 0.6, z: p * 0.4 },
            center: { x: 0, y: fh + bh / 2, z: -D / 2 + p / 2 },
            rot: { x: 0, y: 0, z: s * ang },
            materialId: M.accent,
            label: t('Связь жёсткости'),
          }),
        )
      }
    }
  }

  // ── Торговый стеллаж ──────────────────────────────────────────────────────
  /**
   * Магазинная гондола: перфорированные стойки-лопатки у задней плоскости,
   * задняя панель между ними, база снизу и полки на кронштейнах с отбортовкой
   * и ценникодержателем.
   *
   * Размерная сетка — общая (frame.ts выдаёт для retail side = profile,
   * panel = RETAIL_SLOT), поэтому «полка» в сетке — это ПОСАДОЧНОЕ МЕСТО полки
   * по высоте, а не толщина металла: металл берётся из каталога материала.
   *
   * Осознанные пересечения объёмов (так и в жизни):
   *   • полка шире проёма на 2·profile — она ложится ПОВЕРХ кронштейнов
   *     и заходит торцами на стойки;
   *   • карниз накрывает верх стоек.
   */
  function buildRetail() {
    const R = retailSpec(f)
    const p = Math.max(1, f.profile)
    /*
     * retailSpec() зажимает глубину полки глубиной БАЗЫ, но задняя панель тоже
     * съедает глубину: при shelfDepth === depth полка вылезала бы за пятно
     * застройки ровно на толщину панели, а по пятну считаются магниты
     * и пересечения юнитов. Поэтому здесь ещё раз зажимаем по свободному месту.
     */
    const sd = Math.max(
      MIN_SIZE,
      Math.min(R.shelfDepth, R.island ? (D - bt) / 2 : D - bt),
    )

    /**
     * Наклон полки. Поворот вокруг +X (правая тройка, как в three.js):
     *   y' = y·cosθ − z·sinθ,   z' = y·sinθ + z·cosθ.
     * Точка переднего края (z = +sd/2) при ПОЛОЖИТЕЛЬНОМ θ получает
     * y' = −(sd/2)·sinθ < 0, то есть опускается. ВЫВОД: передний край (+Z)
     * опускает ПОЛОЖИТЕЛЬНЫЙ угол rot.x, а не отрицательный.
     * У зеркальной стороны острова «перёд» лежит в −Z, поэтому там знак
     * обратный: θ = dir · tilt.
     */
    const tilt = (R.tilt * Math.PI) / 180

    /** реальная толщина металла полки — ближайшая покупная, не толще 12 мм */
    const st = Math.max(MIN_SIZE, buildableThickness(M.shelf, RETAIL_SHELF_T))

    /** стороны застройки: обычный стеллаж — только вперёд, островной — обе */
    const sides: ReadonlyArray<1 | -1> = R.island ? [1, -1] : [1]
    /** плоскость, от которой полки этой стороны уходят наружу */
    const nearZ = (dir: 1 | -1): number => (R.island ? dir * (bt / 2) : -D / 2 + bt)
    /** центр зоны полок по глубине */
    const zoneZ = (dir: 1 | -1): number => nearZ(dir) + (dir * sd) / 2
    const tag = (dir: 1 | -1): string => (dir > 0 ? 'f' : 'b')

    // 1) Стойки — по одной на каждую вертикаль сетки.
    // Стойка стоит у задней стенки и уходит вперёд на глубину полок;
    // у островного варианта она сквозная и стоит по центру.
    vs.forEach((v, i) => {
      frame.push(
        mkPart({
          id: `upright-${i}`,
          role: 'upright',
          size: { x: v.b - v.a, y: bh, z: R.island ? D - 2 : sd },
          center: { x: mid(v.a, v.b), y: fh + bh / 2, z: R.island ? 0 : zoneZ(1) },
          materialId: M.carcass,
          // дырки только здесь и на задней стенке; полки, фронт базы,
          // кронштейны и карниз режут из того же листа, но сплошными
          perforated: R.perforated,
          label: t('Стойка перфорированная'),
        }),
      )
    })

    // 2) Задняя панель — на всю ширину, от верха базы до верха стоек.
    // У острова она посередине, и полки идут от неё в обе стороны.
    if (f.back !== 'none' && bt > 0) {
      const backH = bh - R.baseHeight
      back.push(
        mkPart({
          id: 'back',
          role: 'back',
          size: { x: W, y: backH, z: bt },
          center: { x: 0, y: fh + R.baseHeight + backH / 2, z: R.island ? 0 : -D / 2 + bt / 2 },
          materialId: M.back,
          perforated: R.perforated,
          label: R.perforated ? t('Панель задняя перфорированная') : t('Панель задняя'),
        }),
      )
    }

    // 3) База: закрытый цоколь во всю глубину пятна застройки.
    // Если baseHeight === 0 — базы нет, нижний уровень станет обычной полкой.
    if (R.baseHeight > 0) {
      const baseW = W - 2 * p
      for (const dir of sides) {
        frame.push(
          mkPart({
            id: `base-front-${tag(dir)}`,
            role: 'base-front',
            size: { x: baseW, y: R.baseHeight, z: RETAIL_BASE_FRONT_T },
            center: {
              x: 0,
              y: fh + R.baseHeight / 2,
              z: dir * (D / 2 - RETAIL_BASE_FRONT_T / 2),
            },
            materialId: M.carcass,
            label: t('Фронт базы'),
          }),
        )
      }
      if (R.island) {
        // у острова настил делится пополам задней панелью
        for (const dir of sides) {
          frame.push(
            mkPart({
              id: `base-deck-${tag(dir)}`,
              role: 'shelf',
              size: { x: baseW, y: st, z: sd },
              center: { x: 0, y: fh + R.baseHeight + st / 2, z: zoneZ(dir) },
              materialId: M.shelf,
              label: t('Настил базы'),
            }),
          )
        }
      } else {
        frame.push(
          mkPart({
            id: 'base-deck',
            role: 'shelf',
            size: { x: baseW, y: st, z: D - bt },
            center: { x: 0, y: fh + R.baseHeight + st / 2, z: -D / 2 + bt + (D - bt) / 2 },
            materialId: M.shelf,
            label: t('Настил базы'),
          }),
        )
      }

      /*
       * Боковины базы.
       *
       * База выступает вперёд дальше стоек (глубина базы больше глубины полок),
       * и без торцов её коробка висит открытой: видно, что «поддон» ничем не
       * закрыт и ни на что не опирается. На настоящем оборудовании база —
       * замкнутый короб: фронт, два торца и настил сверху.
       * Торец идёт от передней плоскости назад до передней грани стойки,
       * то есть закрывает ровно вылет базы.
       */
      {
        const uprightFront = R.island ? D / 2 : -D / 2 + bt + sd
        const sidePanelZ0 = R.island ? -D / 2 : uprightFront
        // торец упирается В фронт, а не залезает в него: иначе в углу
        // получался кубик наложения 1.5×1.5 мм
        const sideDepth =
          (R.island ? D : D / 2 - uprightFront) - RETAIL_BASE_FRONT_T
        if (sideDepth > 1) {
          for (const sx of [-1, 1] as const) {
            frame.push(
              mkPart({
                id: `base-side-${sx > 0 ? 'r' : 'l'}`,
                role: 'base-front',
                size: { x: RETAIL_BASE_FRONT_T, y: R.baseHeight, z: sideDepth },
                center: {
                  x: sx * (baseW / 2 - RETAIL_BASE_FRONT_T / 2),
                  y: fh + R.baseHeight / 2,
                  z: sidePanelZ0 + sideDepth / 2,
                },
                materialId: M.carcass,
                label: t('Торец базы'),
              }),
            )
          }
        }
      }

      /*
       * Отбортовка переднего края базы.
       *
       * База глубже полок — это не ошибка, а конструкция: у торговой гондолы
       * низ всегда выступает вперёд, так устойчивее и удобнее ставить тяжёлый
       * товар. Но без бортика её край — голый лист в пару миллиметров, и
       * выступ читается как необработанный уступ. Бортик делает его законченной
       * ступенью, как на настоящем оборудовании, и заодно держит товар.
       */
      if (R.lip > 0) {
        for (const dir of sides) {
          const deckFrontZ = R.island ? dir * (zoneZ(dir) + (dir * sd) / 2) : D / 2
          frame.push(
            mkPart({
              id: `base-lip-${tag(dir)}`,
              role: 'lip',
              size: { x: baseW, y: R.lip, z: RETAIL_LIP_T },
              center: {
                x: 0,
                y: fh + R.baseHeight + st + R.lip / 2,
                z: R.island
                  ? deckFrontZ - dir * (RETAIL_LIP_T / 2)
                  : D / 2 - RETAIL_LIP_T / 2,
              },
              materialId: M.shelf,
              label: t('Отбортовка базы'),
            }),
          )
        }
      }
    }

    // 4) Полки по уровням сетки.
    // Уровень 0 занимает база; последний уровень отдан карнизу, если он есть.
    const first = R.baseHeight > 0 ? 1 : 0
    const last = R.header > 0 ? hs.length - 2 : hs.length - 1
    /** верх настила базы — ниже него полка стояла бы внутри базы */
    const baseTop = R.baseHeight > 0 ? fh + R.baseHeight + st : fh

    // прогиб проверяем только у НЕметаллической полки: гнутый стальной профиль
    // с отбортовкой держит нагрузку не как плоский лист той же толщины
    const checkSag = getMaterial(M.shelf).kind !== 'metal'

    for (let i = first; i <= last; i++) {
      const h = hs[i]
      if (h.a < baseTop - 0.01) continue
      for (const [c0, c1] of segments(cs.length, (c) => supH.has(`${i}@${c}`))) {
        /*
         * Полка встаёт МЕЖДУ стойками на кронштейны, а не поверх них.
         *
         * Раньше она была шире проёма на профиль с каждой стороны и торцами
         * входила внутрь стойки. Беда не в скрытом объёме: глубина у полки и
         * у стойки одна и та же, поэтому их передние и задние плоскости
         * совпадали ТОЧНО — две сонаправленные грани на одной глубине дают
         * мерцание (z-fighting) полосой по краю полки.
         * Зазор в 1 мм оставляем, чтобы полка «падала» в проём.
         */
        const x0 = cs[c0].a + RETAIL_SHELF_GAP
        const x1 = cs[c1].b - RETAIL_SHELF_GAP
        for (const dir of sides) {
          retailShelf(i, c0, c1, x0, x1, h.a, dir)
        }
        if (checkSag) {
          // стойки стоят на каждой границе колонки, поэтому чистый пролёт —
          // это самая широкая колонка сегмента, а не длина всей полки
          let clear = 0
          for (let c = c0; c <= c1; c++) clear = Math.max(clear, f.cols[c] ?? 0)
          spanChecks.push({ span: clear, t: st, materialId: M.shelf })
        }
      }
    }

    // 5) Карниз — рекламный фриз поверх стоек
    if (R.header > 0) {
      frame.push(
        mkPart({
          id: 'header',
          role: 'header',
          size: { x: W, y: R.header, z: RETAIL_HEADER_T },
          center: {
            x: 0,
            y: H - R.header / 2,
            z: R.island ? 0 : -D / 2 + bt + RETAIL_HEADER_T / 2,
          },
          materialId: M.carcass,
          label: t('Карниз'),
        }),
      )
    }

    /** Одна полка сегмента со всей обвязкой: кронштейны, отбортовка, ценник */
    function retailShelf(
      level: number,
      c0: number,
      c1: number,
      x0: number,
      x1: number,
      shelfBottom: number,
      dir: 1 | -1,
    ): void {
      const sw = x1 - x0
      const xc = mid(x0, x1)
      const zc = zoneZ(dir)
      const yc = shelfBottom + st / 2
      const th = dir * tilt
      const cos = Math.cos(th)
      const sin = Math.sin(th)
      const key = `${level}-${c0}-${tag(dir)}`
      /**
       * Точка, жёстко связанная с полкой.
       *
       * Наклон идёт вокруг ЗАДНЕГО края: там полка висит на крюках кронштейнов
       * в перфорации стойки, эта линия неподвижна, а вниз едет передний край.
       * Если крутить вокруг центра детали (как делает рендер по part.rot),
       * задний край поднимется — верхняя полка вылезет за габарит стеллажа.
       * Поэтому смещение (dy, dz) от НЕнаклонённого центра пересчитывается
       * относительно задней кромки, и все довески (борт, ценник) едут вместе.
       */
      const anchorZ = zc - (dir * sd) / 2
      const at = (dy: number, dz: number): Vec3 => {
        const oz = dz + (dir * sd) / 2
        return {
          x: xc,
          y: yc + dy * cos - oz * sin,
          z: anchorZ + dy * sin + oz * cos,
        }
      }
      const rot: Vec3 | undefined = R.tilt > 0 ? { x: th, y: 0, z: 0 } : undefined

      frame.push(
        mkPart({
          id: `shelf-${key}`,
          role: 'shelf',
          size: { x: sw, y: st, z: sd },
          center: at(0, 0),
          rot,
          materialId: M.shelf,
          label: t('Полка торговая'),
        }),
      )

      if (R.lip > 0) {
        frame.push(
          mkPart({
            id: `lip-${key}`,
            role: 'lip',
            size: { x: sw, y: R.lip, z: RETAIL_LIP_T },
            // борт стоит на плоскости полки, наружной гранью вровень с её краем
            center: at(st / 2 + R.lip / 2, dir * (sd / 2 - RETAIL_LIP_T / 2)),
            rot,
            materialId: M.shelf,
            label: t('Отбортовка полки'),
          }),
        )
      }

      // ценник висит под передней кромкой; у самой нижней полки без базы
      // ему некуда деться — там он ушёл бы под пол
      if (R.priceRail && shelfBottom - RETAIL_RAIL_H >= 0) {
        frame.push(
          mkPart({
            id: `price-rail-${key}`,
            role: 'price-rail',
            size: { x: sw, y: RETAIL_RAIL_H, z: RETAIL_RAIL_T },
            center: at(-(st / 2 + RETAIL_RAIL_H / 2), dir * (sd / 2 - RETAIL_RAIL_T / 2)),
            rot,
            materialId: 'abs-white',
            label: t('Ценникодержатель'),
          }),
        )
      }

      // Кронштейны: по одному на каждую стойку сегмента, задним краем к стенке.
      // По X кронштейн прижат к БОКУ стойки, а не спрятан внутрь неё:
      // иначе его вообще не видно.
      const brH = Math.min(RETAIL_BRACKET_H, shelfBottom - fh)
      if (brH < 5) return
      for (let k = c0; k <= c1 + 1; k++) {
        const v = vs[k]
        const bx =
          k === c1 + 1 ? v.a - RETAIL_BRACKET_T / 2 : v.b + RETAIL_BRACKET_T / 2
        frame.push(
          mkPart({
            id: `bracket-${key}-${k}`,
            role: 'bracket',
            size: { x: RETAIL_BRACKET_T, y: brH, z: sd * RETAIL_BRACKET_DEPTH },
            center: {
              x: bx,
              y: shelfBottom - brH / 2,
              z: nearZ(dir) + (dir * sd * RETAIL_BRACKET_DEPTH) / 2,
            },
            materialId: M.accent,
            label: t('Кронштейн полки'),
          }),
        )
      }
    }
  }

  // ── Задняя стенка ─────────────────────────────────────────────────────────
  function buildBack() {
    if (f.back === 'none' || bt <= 0) return
    const zc = -D / 2 + bt / 2
    if (f.back === 'full') {
      // стенка утоплена в глубину корпуса (zRanges), поэтому по X и Y она
      // ВСТАВЛЕНА между боковинами и между дном и крышкой, а не наложена на них
      back.push(
        mkPart({
          id: 'back',
          role: 'back',
          size: { x: W - 2 * side, y: bh - 2 * side, z: bt },
          center: { x: 0, y: fh + bh / 2, z: zc },
          materialId: M.back,
          label: t('Задняя стенка'),
        }),
      )
      return
    }
    for (const rect of rects) {
      if (rect.cell.back !== true) continue
      back.push(
        mkPart({
          id: `back-${rect.key}`,
          role: 'back',
          size: { x: rect.x1 - rect.x0, y: rect.y1 - rect.y0, z: bt },
          center: { x: mid(rect.x0, rect.x1), y: mid(rect.y0, rect.y1), z: zc },
          materialId: M.back,
          cellKey: rect.key,
          label: t('Задняя стенка ячейки'),
        }),
      )
    }
  }

  // ── Наполнение ячеек ──────────────────────────────────────────────────────
  function buildCells() {
    const ft = Math.max(1, f.panel)
    const ov = Math.max(0, f.topOverhang)
    /** низ крышки/столешницы — выше него накладной фасад лезть не должен */
    const underTop = hs[hs.length - 1].a
    for (const rect of rects) {
      const cw = rect.x1 - rect.x0
      const ch = rect.y1 - rect.y0
      const cd = rect.z1 - rect.z0
      const cx = mid(rect.x0, rect.x1)
      const cy = mid(rect.y0, rect.y1)
      const cz = mid(rect.z0, rect.z1)
      const cellMat = rect.cell.material ?? M.shelf
      // накладной фасад перекрывает половину соседней панели с каждой стороны
      const fw = cw + panel - FRONT_GAP
      const fx0 = cx - fw / 2
      const fx1 = cx + fw / 2
      // по вертикали: под свесом столешницы фасад обрезаем по её низу,
      // иначе он въезжает в вынесенную вперёд столешницу
      const fy0 = cy - (ch + panel - FRONT_GAP) / 2
      const fy1 = ov > 0 ? Math.min(cy + (ch + panel - FRONT_GAP) / 2, underTop) : cy + (ch + panel - FRONT_GAP) / 2
      const fhH = fy1 - fy0
      const fcy = mid(fy0, fy1)
      const frontZ = D / 2 + ft / 2
      const fill = rect.cell.fill

      switch (fill.t) {
        case 'empty':
          break

        case 'shelves': {
          const n = clampInt(fill.count, 1, 8)
          const step = ch / (n + 1)
          for (let i = 1; i <= n; i++) {
            content.push(
              mkPart({
                id: `sub-shelf-${rect.key}-${i}`,
                role: 'sub-shelf',
                size: { x: cw, y: f.panel, z: cd },
                center: { x: cx, y: rect.y0 + step * i, z: cz },
                materialId: cellMat,
                cellKey: rect.key,
                label: t('Полка внутренняя'),
              }),
            )
          }
          spanChecks.push({ span: cw, t: f.panel, materialId: cellMat, cellKey: rect.key })
          break
        }

        case 'dividers': {
          const n = clampInt(fill.count, 1, 8)
          const step = cw / (n + 1)
          for (let i = 1; i <= n; i++) {
            content.push(
              mkPart({
                id: `sub-divider-${rect.key}-${i}`,
                role: 'sub-divider',
                size: { x: f.panel, y: ch, z: cd },
                center: { x: rect.x0 + step * i, y: cy, z: cz },
                materialId: cellMat,
                cellKey: rect.key,
                label: t('Перегородка внутренняя'),
              }),
            )
          }
          break
        }

        case 'rod': {
          const ry = rect.y1 - ROD_DROP
          content.push(
            mkPart({
              id: `rod-${rect.key}`,
              role: 'rod',
              shape: 'cylinder',
              // конвенция types.ts: x/z — диаметр, y — длина; rot.z кладёт ось вдоль X
              size: { x: ROD_D, y: cw - ROD_END_GAP, z: ROD_D },
              center: { x: cx, y: ry, z: cz },
              rot: { x: 0, y: 0, z: Math.PI / 2 },
              materialId: M.accent,
              cellKey: rect.key,
              label: t('Штанга'),
            }),
          )
          for (const s of [-1, 1] as const) {
            content.push(
              mkPart({
                id: `rod-flange-${rect.key}-${s < 0 ? 'l' : 'r'}`,
                role: 'rod',
                shape: 'cylinder',
                size: { x: ROD_FLANGE_D, y: ROD_FLANGE_T, z: ROD_FLANGE_D },
                center: {
                  x: s < 0 ? rect.x0 + ROD_FLANGE_T / 2 : rect.x1 - ROD_FLANGE_T / 2,
                  y: ry,
                  z: cz,
                },
                rot: { x: 0, y: 0, z: Math.PI / 2 },
                materialId: M.accent,
                cellKey: rect.key,
                label: t('Фланец штанги'),
              }),
            )
          }
          break
        }

        case 'panel': {
          // по контракту types.ts — заглушка ЗАПОДЛИЦО: вставлена в проём,
          // передняя плоскость совпадает с фасадной плоскостью корпуса
          fronts.push(
            mkPart({
              id: `panel-${rect.key}`,
              role: 'door',
              size: { x: cw, y: ch, z: ft },
              center: { x: cx, y: cy, z: D / 2 - ft / 2 },
              materialId: M.front,
              cellKey: rect.key,
              label: t('Панель-заглушка'),
            }),
          )
          break
        }

        case 'door': {
          const matId = fill.style === 'glass' ? 'glass-clear' : M.front
          const group = `door-${rect.key}`
          const motion: PartMotion =
            fill.hinge === 'up'
              ? {
                  kind: 'hinge',
                  group,
                  pivot: { x: cx, y: fy1, z: D / 2 },
                  axis: { x: 1, y: 0, z: 0 },
                  maxAngle: -FLAP_ANGLE,
                }
              : fill.hinge === 'left'
                ? {
                    kind: 'hinge',
                    group,
                    pivot: { x: fx0, y: fcy, z: D / 2 },
                    axis: { x: 0, y: 1, z: 0 },
                    maxAngle: -DOOR_ANGLE,
                  }
                : {
                    kind: 'hinge',
                    group,
                    pivot: { x: fx1, y: fcy, z: D / 2 },
                    axis: { x: 0, y: 1, z: 0 },
                    maxAngle: DOOR_ANGLE,
                  }

          const innerW = fw - 2 * SLAT_FRAME
          const innerH = fhH - 2 * SLAT_FRAME
          if (fill.style === 'slatted' && innerW > 0 && innerH > 0) {
            // Рама по периметру. Кромка задаётся явно: створка обкатывается
            // ОДИН раз по внешнему контуру, внутренние стыки рамы и торцы реек
            // под кромку не идут — иначе смета насчитает периметр 11 раз.
            const bars: Array<{ id: string; size: Vec3; center: Vec3; edge: number }> = [
              {
                id: 'l',
                size: { x: SLAT_FRAME, y: fhH, z: ft },
                center: { x: fx0 + SLAT_FRAME / 2, y: fcy, z: frontZ },
                edge: fhH,
              },
              {
                id: 'r',
                size: { x: SLAT_FRAME, y: fhH, z: ft },
                center: { x: fx1 - SLAT_FRAME / 2, y: fcy, z: frontZ },
                edge: fhH,
              },
              {
                id: 'b',
                size: { x: innerW, y: SLAT_FRAME, z: ft },
                center: { x: cx, y: fy0 + SLAT_FRAME / 2, z: frontZ },
                edge: innerW,
              },
              {
                id: 't',
                size: { x: innerW, y: SLAT_FRAME, z: ft },
                center: { x: cx, y: fy1 - SLAT_FRAME / 2, z: frontZ },
                edge: innerW,
              },
            ]
            for (const b of bars) {
              fronts.push(
                mkPart({
                  id: `door-${rect.key}-frame-${b.id}`,
                  role: 'door',
                  size: b.size,
                  center: b.center,
                  materialId: matId,
                  cellKey: rect.key,
                  motion,
                  edge: b.edge,
                  label: t('Рама фасада'),
                }),
              )
            }
            /*
             * Рейка тоньше рамы, но её толщина обязана существовать в продаже:
             * ft * 0.6 давало 10.8 мм ЛДСП, которого не бывает, и раскрой
             * получал фантомный лист. Берём самый тонкий лист этого материала,
             * не толще самой рамы.
             */
            const slatThickness = Math.min(ft, Math.min(...getMaterial(matId).thicknesses))
            const pitch = innerH / SLAT_COUNT
            for (let i = 0; i < SLAT_COUNT; i++) {
              fronts.push(
                mkPart({
                  id: `door-${rect.key}-slat-${i}`,
                  role: 'door',
                  size: { x: innerW, y: pitch * 0.7, z: slatThickness },
                  center: { x: cx, y: fy0 + SLAT_FRAME + pitch * (i + 0.5), z: frontZ },
                  materialId: matId,
                  cellKey: rect.key,
                  motion,
                  // у рейки видны только две длинные грани
                  edge: 2 * innerW,
                  label: t('Рейка фасада'),
                }),
              )
            }
          } else {
            fronts.push(
              mkPart({
                id: `door-${rect.key}`,
                role: 'door',
                size: { x: fw, y: fhH, z: ft },
                center: { x: cx, y: fcy, z: frontZ },
                materialId: matId,
                cellKey: rect.key,
                motion,
                label: t('Фасад двери'),
              }),
            )
          }
          break
        }

        case 'drawers': {
          const n = clampInt(fill.count, 1, 6)
          const dh = ch / n
          const boxDepth = cd - DRAWER_BACK_GAP
          const travel = Math.max(0, boxDepth)
          // Накладные фасады делят ОДНУ общую полосу высотой fhH: между ними нет
          // полки, поэтому шаг считается по полосе, а не по проёму ящика,
          // иначе соседние фасады перекрываются на (panel - FRONT_GAP) мм.
          const bandY0 = fy0
          const pitch = (fhH + FRONT_GAP) / n
          const frontH = pitch - FRONT_GAP
          for (let i = 0; i < n; i++) {
            const gy0 = rect.y0 + dh * i
            const fyc = bandY0 + pitch * i + frontH / 2
            const group = `drawer-${rect.key}-${i}`
            const motion: PartMotion = { kind: 'slide', travel, group }

            fronts.push(
              mkPart({
                id: `drawer-front-${rect.key}-${i}`,
                role: 'drawer-front',
                size: { x: fw, y: frontH, z: ft },
                center: { x: cx, y: fyc, z: frontZ },
                materialId: M.front,
                cellKey: rect.key,
                motion,
                label: t('Фасад ящика'),
              }),
            )

            for (const s of [-1, 1] as const) {
              fronts.push(
                mkPart({
                  id: `drawer-side-${rect.key}-${i}-${s < 0 ? 'l' : 'r'}`,
                  role: 'drawer-side',
                  size: { x: DRAWER_SIDE_T, y: dh * 0.66, z: boxDepth },
                  center: { x: cx + s * (cw / 2 - DRAWER_SIDE_INSET), y: gy0 + dh * 0.4, z: cz },
                  materialId: DRAWER_BOX_MATERIAL,
                  cellKey: rect.key,
                  motion,
                  label: t('Царга ящика'),
                }),
              )
            }

            fronts.push(
              mkPart({
                id: `drawer-bottom-${rect.key}-${i}`,
                role: 'drawer-bottom',
                // чистый просвет между царгами: их ЦЕНТРЫ отступают на INSET,
                // значит внутренние грани — на INSET + T/2 от края ячейки
                size: { x: cw - 2 * DRAWER_SIDE_INSET - DRAWER_SIDE_T, y: 8, z: boxDepth },
                center: { x: cx, y: gy0 + dh * 0.4 - dh * 0.33, z: cz },
                materialId: 'hdf-back',
                cellKey: rect.key,
                motion,
                label: t('Дно ящика'),
              }),
            )

            if (fill.front !== 'handleless') {
              fronts.push(
                mkPart({
                  id: `handle-${rect.key}-${i}`,
                  role: 'handle',
                  shape: 'cylinder',
                  size: { x: 16, y: Math.min(cw * 0.5, 220), z: 16 },
                  // ручка — по центру ФАСАДА, а не проёма
                  center: { x: cx, y: fyc, z: D / 2 + ft + HANDLE_OUT },
                  rot: { x: 0, y: 0, z: Math.PI / 2 },
                  materialId: M.accent,
                  cellKey: rect.key,
                  motion,
                  label: t('Ручка'),
                }),
              )
            }
          }
          break
        }

        case 'box': {
          content.push(
            mkPart({
              id: `box-${rect.key}`,
              role: 'box',
              size: { x: cw - BOX_INSET_X, y: ch - BOX_INSET_Y, z: cd - BOX_INSET_Z },
              center: { x: cx, y: rect.y0 + (ch - BOX_INSET_Y) / 2 + BOX_LIFT, z: cz },
              materialId: 'felt-grey',
              cellKey: rect.key,
              label: t('Короб'),
            }),
          )
          break
        }
      }
    }
  }

  // ── Ножки / цоколь ────────────────────────────────────────────────────────
  function buildFeet() {
    if (fh <= 0) return

    if (f.feet === 'plinth') {
      /*
       * Цоколь — П-образная РАМА из досок, а не монолитный брусок.
       * Сплошным блоком он давал в смете «лист толщиной 60 мм», которого
       * не существует ни в одном материале, и завышал площадь втрое.
       * Видно всё равно только переднюю царгу — картинка не меняется.
       */
      const pt = Math.max(6, f.panel)
      const plinthW = W - PLINTH_INSET_X
      const plinthD = D - PLINTH_INSET_Z
      const frontZ = PLINTH_SHIFT_Z + plinthD / 2 - pt / 2
      const backZ = PLINTH_SHIFT_Z - plinthD / 2 + pt / 2

      feet.push(
        mkPart({
          id: 'plinth-front',
          role: 'plinth',
          size: { x: plinthW, y: fh, z: pt },
          center: { x: 0, y: fh / 2, z: frontZ },
          materialId: M.carcass,
          label: t('Царга цоколя передняя'),
        }),
        mkPart({
          id: 'plinth-back',
          role: 'plinth',
          size: { x: plinthW, y: fh, z: pt },
          center: { x: 0, y: fh / 2, z: backZ },
          materialId: M.carcass,
          label: t('Царга цоколя задняя'),
        }),
      )

      // боковые царги — только если между передней и задней вообще есть место
      const sideD = plinthD - 2 * pt
      if (sideD > 20) {
        for (const s of [-1, 1]) {
          feet.push(
            mkPart({
              id: `plinth-side-${s > 0 ? 'r' : 'l'}`,
              role: 'plinth',
              size: { x: pt, y: fh, z: sideD },
              center: { x: s * (plinthW / 2 - pt / 2), y: fh / 2, z: PLINTH_SHIFT_Z },
              materialId: M.carcass,
              label: s > 0 ? t('Царга цоколя правая') : t('Царга цоколя левая'),
            }),
          )
        }
      }
      return
    }

    if (f.feet === 'legs-round' || f.feet === 'levelers') {
      const d = f.feet === 'legs-round' ? LEG_ROUND_D : LEVELER_D
      const inset = f.feet === 'legs-round' ? LEG_ROUND_INSET : LEVELER_INSET
      const label = f.feet === 'legs-round' ? t('Ножка круглая') : t('Опора регулируемая')
      let n = 0

      /*
       * Торговый стеллаж: по две опоры под КАЖДОЙ стойкой — у её заднего и
       * переднего края. Четырёх опор по углам мало: стойки несут всю нагрузку.
       *
       * Глубину берём по СТОЙКЕ, а не по базе. База выступает вперёд дальше
       * стоек, и опора, поставленная по её краю (D/2 − отступ), оказывалась
       * впереди стойки и в стороне от базы по ширине — то есть стояла в
       * пустоте и ни на что не опиралась.
       */
      if (f.style === 'retail') {
        const rf = retailSpec(f)
        const shelfD = Math.max(
          MIN_SIZE,
          Math.min(rf.shelfDepth, rf.island ? (D - bt) / 2 : D - bt),
        )
        // z-габарит стойки: у острова она сквозная, иначе стоит у задней стенки
        const upBack = rf.island ? -D / 2 + 1 : -D / 2 + bt
        const upFront = rf.island ? D / 2 - 1 : -D / 2 + bt + shelfD
        // отступ не должен схлопнуть опоры в одну точку на мелкой стойке
        const zInset = Math.min(inset, Math.max(0, (upFront - upBack - d) / 2))
        for (const v of vs) {
          for (const z of [upBack + zInset, upFront - zInset]) {
            feet.push(
              mkPart({
                id: `foot-${n++}`,
                role: 'foot',
                shape: 'cylinder',
                size: { x: d, y: fh, z: d },
                center: { x: mid(v.a, v.b), y: fh / 2, z },
                materialId: M.accent,
                label,
              }),
            )
          }
        }
        return
      }

      // В стальном каркасе опора идёт под КАЖДУЮ стойку — иначе стойки висят в воздухе
      if (f.style === 'steel-frame') {
        for (const v of vs) {
          for (const sz of [-1, 1] as const) {
            feet.push(
              mkPart({
                id: `foot-${n++}`,
                role: 'foot',
                shape: 'cylinder',
                size: { x: d, y: fh, z: d },
                center: { x: mid(v.a, v.b), y: fh / 2, z: sz * (D / 2 - side / 2) },
                materialId: M.accent,
                label,
              }),
            )
          }
        }
        return
      }

      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          feet.push(
            mkPart({
              id: `foot-${n++}`,
              role: 'foot',
              shape: 'cylinder',
              size: { x: d, y: fh, z: d },
              center: { x: sx * (W / 2 - inset), y: fh / 2, z: sz * (D / 2 - inset) },
              materialId: M.accent,
              label,
            }),
          )
        }
      }
      return
    }

    if (f.feet === 'legs-hairpin') {
      const s = fh * HAIRPIN_SPREAD
      const len = Math.hypot(fh, s)
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const px = sx * (W / 2 - HAIRPIN_INSET)
          const pz = sz * (D / 2 - HAIRPIN_INSET)
          const tag = `${sx < 0 ? 'l' : 'r'}${sz < 0 ? 'b' : 'f'}`

          // стержень в плоскости XY: верх у угла (px, fh), низ наружу по X
          feet.push(
            mkPart({
              id: `foot-${tag}-x`,
              role: 'foot',
              shape: 'cylinder',
              size: { x: HAIRPIN_D, y: len, z: HAIRPIN_D },
              center: { x: px + (sx * s) / 2, y: fh / 2, z: pz },
              rot: { x: 0, y: 0, z: Math.atan2(sx * s, fh) },
              materialId: M.accent,
              label: t('Ножка-шпилька'),
            }),
          )
          // стержень в плоскости ZY: низ наружу по Z
          feet.push(
            mkPart({
              id: `foot-${tag}-z`,
              role: 'foot',
              shape: 'cylinder',
              size: { x: HAIRPIN_D, y: len, z: HAIRPIN_D },
              center: { x: px, y: fh / 2, z: pz + (sz * s) / 2 },
              rot: { x: Math.atan2(-sz * s, fh), y: 0, z: 0 },
              materialId: M.accent,
              label: t('Ножка-шпилька'),
            }),
          )
          // площадка крепления под корпусом
          feet.push(
            mkPart({
              id: `foot-plate-${tag}`,
              role: 'foot',
              size: { x: HAIRPIN_PLATE, y: HAIRPIN_PLATE_T, z: HAIRPIN_PLATE },
              center: { x: px, y: fh - HAIRPIN_PLATE_T / 2, z: pz },
              materialId: M.accent,
              label: t('Площадка ножки'),
            }),
          )
        }
      }
    }
  }

  // ── Сборка списка: стекло — в самый конец ─────────────────────────────────
  const ordered = [...frame, ...back, ...content, ...fronts, ...feet]
  const parts = [...ordered.filter((p) => !p.glass), ...ordered.filter((p) => p.glass)]
  dedupeIds(parts)

  const colBounds = vs.slice(1, -1).map((v) => v.a + W / 2)
  const rowBounds = hs.slice(1, -1).map((h) => h.a)

  return {
    parts,
    outer: outerSize(f),
    colBounds,
    rowBounds,
    cellRects: rects,
    covered,
    warnings: buildWarnings(unit, spanChecks),
  }
}

/** Страховка от совпадения id (детали одной роли из разных источников) */
function dedupeIds(parts: Part[]): void {
  const seen = new Set<string>()
  for (const p of parts) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      continue
    }
    let i = 2
    while (seen.has(`${p.id}#${i}`)) i++
    p.id = `${p.id}#${i}`
    seen.add(p.id)
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Инженерные предупреждения
// ────────────────────────────────────────────────────────────────────────────

function buildWarnings(unit: ShelfUnit, spans: SpanCheck[]): Warning[] {
  const f = unit.frame
  const out: Warning[] = []
  const seen = new Set<string>()

  const push = (w: Warning) => {
    const k = `${w.code}|${w.cellKey ?? ''}|${w.message}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(w)
  }

  for (const s of spans) {
    if (s.span > 900 && s.t < 25) {
      push({
        level: 'warn',
        code: 'span-sag',
        message: t('Полка {span} мм при толщине {thickness} мм прогнётся, добавьте перегородку', {
          span: Math.round(s.span),
          thickness: r1(s.t),
        }),
        unitId: unit.id,
        cellKey: s.cellKey,
      })
    }
    if (getMaterial(s.materialId).kind === 'glass' && s.span > 700) {
      push({
        level: 'warn',
        code: 'glass-span',
        message: t('Стеклянная полка {span} мм — пролёт больше 700 мм, нужна опора', {
          span: Math.round(s.span),
        }),
        unitId: unit.id,
        cellKey: s.cellKey,
      })
    }
  }

  const W = outerWidth(f)
  const H = outerHeight(f)

  if (H > 1800) {
    push({
      level: 'info',
      code: 'tip-over',
      message: t('Высота {h} мм — закрепите к стене (антиопрокидыватель)', { h: Math.round(H) }),
      unitId: unit.id,
    })
  }
  if (f.depth > 700) {
    push({
      level: 'info',
      code: 'deep',
      message: t('Глубина {d} мм — до задней стенки трудно дотянуться', {
        d: Math.round(f.depth),
      }),
      unitId: unit.id,
    })
  }
  if (f.back === 'none' && f.style === 'carcass' && f.cols.length > 2) {
    push({
      level: 'info',
      code: 'no-back',
      message: t('Без задней стенки корпус потеряет жёсткость'),
      unitId: unit.id,
    })
  }
  if (f.style === 'retail') {
    const R = retailSpec(f)
    if (R.tilt > 0 && R.lip === 0) {
      push({
        level: 'info',
        code: 'retail-tilt',
        message: t('Наклонная полка без отбортовки — товар соскользнёт'),
        unitId: unit.id,
      })
    }
    /*
     * retailSpec() уже зажимает глубину полки глубиной базы, поэтому сравнивать
     * надо с ЗАПРОШЕННЫМ значением: иначе предупреждение не сработает никогда,
     * а пользователь так и не поймёт, почему полка не стала глубже.
     */
    const wanted = f.retail?.shelfDepth ?? DEFAULT_RETAIL.shelfDepth
    if (Math.max(wanted, R.shelfDepth) > f.depth) {
      push({
        level: 'warn',
        code: 'retail-deep',
        message: t('Полка {shelf} мм глубже базы {base} мм — опрокинется', {
          shelf: Math.round(wanted),
          base: Math.round(f.depth),
        }),
        unitId: unit.id,
      })
    }
  }
  // у торгового стеллажа frame.panel не участвует в геометрии:
  // шаг перфорации задаёт RETAIL_SLOT, поэтому проверять толщину плиты нечего
  if (f.panel < 12 && f.style !== 'retail') {
    push({
      level: 'warn',
      code: 'thin-panel',
      message: t('Толщина плиты {n} мм слишком мала для полок', { n: r1(f.panel) }),
      unitId: unit.id,
    })
  }
  if (W > 4000 || H > 3000) {
    push({
      level: 'warn',
      code: 'huge',
      message: t('Габарит {w}×{h} мм — разбейте на несколько секций', {
        w: Math.round(W),
        h: Math.round(H),
      }),
      unitId: unit.id,
    })
  }

  return out
}
