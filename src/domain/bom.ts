/**
 * Смета: детали, фурнитура, материалы, масса и цена.
 *
 * Единственный вход — детали из geometry.ts. Ничего не пересчитываем «на глаз»:
 * размеры берутся из Part.cut (листовое) либо Part.size (объёмное).
 * Все размеры на входе — мм, на выходе — м², м³, кг и деньги.
 *
 * ДЕНЬГИ. Все денежные числа BomResult (BomLine.priceEach/priceTotal,
 * HardwareLine.priceEach/priceTotal, byMaterial[].price и весь totals.*) —
 * обычные числа В ВАЛЮТЕ СБОРКИ: рубли в русской версии, доллары в английской.
 * Это НЕ рубли, которые кто-то ниже поделит на курс: курса в проекте нет,
 * выбор колонки прайса произошёл раньше — в аксессорах matPrice* и priceOf.
 * Поэтому наверх (money/fmtMoney, CSV, PDF) число уходит как есть.
 */

import type {
  BomLine,
  BomResult,
  HardwareLine,
  MaterialDef,
  Part,
  PartRole,
  ShelfUnit,
  Warning,
} from '@/domain/types'
import {
  getMaterial,
  matEdgePrice,
  matPriceKg,
  matPriceM2,
  materialName,
} from '@/domain/materials'
import { type Price, priceOf } from '@/i18n/currency'
import { getUnitGeometry } from '@/domain/geometry'
import { outerHeight } from '@/domain/frame'
import { fmtDims } from '@/domain/format'
import { INTL_LOCALE, t } from '@/i18n'

// ────────────────────────────────────────────────────────────────────────────
//  Константы расчёта
// ────────────────────────────────────────────────────────────────────────────

/**
 * Доля металла в габаритном объёме профиля: труба 30×30×1.5 — это ~28 % сечения.
 * Штанги, ручки и опоры точёные, считаются сплошными.
 */
const METAL_FILL: Partial<Record<PartRole, number>> = {
  post: 0.28,
  rail: 0.28,
  brace: 0.28,
  /*
   * Торговый стеллаж. Эти роли НЕ входят в CUT_ROLES, поэтому идут по ветке
   * габаритного объёма — а рисует их геометрия монолитом, ради силуэта.
   * В жизни это тонкий гнутый лист, и сплошной объём завысил бы массу в разы.
   * Масса здесь не украшение: по ней считается цена металла (₽/кг) и
   * предупреждение о том, что стеллаж придётся собирать на месте.
   *   стойка    — перфорированная лопатка, отверстия съедают часть металла;
   *   кронштейн — штампованная косынка 3 мм, почти сплошная;
   *   отбортовка и фронт базы — тот же лист, что и полка;
   *   карниз    — гнутый короб, внутри пусто.
   *
   * Полки здесь НЕТ намеренно: роль 'shelf' входит в CUT_ROLES и считается
   * по другой ветке, где для металла уже берётся наименьший калибр листа
   * (0.8 мм вместо нарисованных 3). Вписать её сюда значило бы применить
   * коэффициент и к ДЕРЕВЯННЫМ полкам всех остальных стеллажей — таблица
   * смотрит на роль, а не на материал.
   */
  /*
   * Коэффициенты выведены из ФАКТИЧЕСКОЙ толщины листа, делённой на
   * нарисованный габарит, а не подобраны на глаз:
   *   стойка   1.5 мм стали в плите шириной 40 мм → 1.5/40  ≈ 0.038
   *   карниз   1.5 мм в коробе глубиной 20 мм     → 1.5/20  ≈ 0.075, с полками 0.2
   *   кронштейн косынка 3 мм нарисована 3 мм      → почти сплошная
   *   отбортовка и фронт базы нарисованы своей реальной толщиной → 1.0
   * Проверка: 2 стойки высотой 1980 дают 18.6 кг вместо 124 кг при 0.25.
   * Секция 1000×2000 в сумме выходит около 50 кг — столько и весит настоящая.
   */
  upright: 0.038,
  bracket: 0.9,
  lip: 1,
  'base-front': 1,
  header: 0.2,
}

/**
 * Детали, которые геометрия рисует монолитом ради силуэта, а собирают их
 * из тонкого материала: короб — стенки, цоколь — передняя и задняя царги.
 * Поправка идёт только в массу; площадь и цена остаются по габариту.
 */
const SHELL_FILL: Partial<Record<PartRole, number>> = {
  box: 0.12,
  plinth: 0.2,
  // ценникодержатель — не брусок пластика, а C-профиль с пустотой внутри
  'price-rail': 0.3,
}

/** Реалистичный выход полезной площади при раскрое листа */
export const SHEET_YIELD = 0.82

/** Роли, каждая деталь которых даёт 4 конфирмата на стяжку */
const CONFIRMAT_ROLES: PartRole[] = ['side', 'top', 'bottom', 'divider', 'shelf']

interface HwDef {
  key: string
  /** русский оригинал — ключ словаря; наружу уходит уже переведённым */
  label: string
  /** пара независимых прайсов: рублёвый и долларовый */
  priceEach: Price
  massEach: number
}

/**
 * Фурнитура. Цена — такая же пара { rub, usd }, как в каталоге материалов,
 * и долларовая колонка так же независима: она выведена из рублёвой один раз
 * и дальше правится отдельно.
 *
 * Ступень округления вверх та же, что у материалов (0.5 до $10), но для
 * позиций ДЕШЕВЛЕ доллара она взята мельче — 0.05. Иначе конфирмат за 6 ₽
 * ($0.065) превратился бы в $0.5, то есть подорожал бы в семь раз, а их в
 * корпусе сотни: крепёж перевесил бы плиту и итог поехал бы на десятки
 * процентов. Пять центов — реальная торговая ступень для метизов.
 */
const HW = {
  hinge: { key: 'hinge', label: 'Петля мебельная', priceEach: { rub: 420, usd: 5 }, massEach: 0.09 },
  slide: {
    key: 'slide',
    label: 'Направляющие скрытого монтажа, компл.',
    priceEach: { rub: 1250, usd: 14 },
    massEach: 0.9,
  },
  handle: { key: 'handle', label: 'Ручка', priceEach: { rub: 380, usd: 4.5 }, massEach: 0.08 },
  confirmat: {
    key: 'confirmat',
    label: 'Конфирмат 7×50',
    priceEach: { rub: 6, usd: 0.1 },
    massEach: 0.012,
  },
  shelfPin: {
    key: 'shelf-pin',
    label: 'Полкодержатель',
    priceEach: { rub: 12, usd: 0.15 },
    massEach: 0.008,
  },
  leveler: {
    key: 'leveler',
    label: 'Опора регулируемая',
    priceEach: { rub: 90, usd: 1 },
    massEach: 0.05,
  },
  rodHolder: {
    key: 'rod-holder',
    label: 'Штангодержатель',
    priceEach: { rub: 190, usd: 2.5 },
    massEach: 0.04,
  },
  wallBracket: {
    key: 'wall-bracket',
    label: 'Уголок крепёжный к стене',
    priceEach: { rub: 140, usd: 2 },
    massEach: 0.06,
  },
  screw: { key: 'screw', label: 'Саморез 4×16', priceEach: { rub: 3, usd: 0.05 }, massEach: 0.004 },
} satisfies Record<string, HwDef>

/**
  * Запасные подписи, если геометрия не дала label.
  * Значения — русские оригиналы, то есть ключи словаря: перевод происходит
  * в момент чтения (см. addPart), а не здесь.
  */
const ROLE_RU: Record<PartRole, string> = {
  side: 'Боковина',
  top: 'Крышка',
  bottom: 'Дно',
  divider: 'Перегородка',
  shelf: 'Полка',
  'sub-shelf': 'Полка дополнительная',
  'sub-divider': 'Подперегородка',
  back: 'Задняя стенка',
  plinth: 'Цоколь',
  door: 'Дверь',
  'drawer-front': 'Фасад ящика',
  'drawer-side': 'Царга ящика',
  'drawer-bottom': 'Дно ящика',
  rod: 'Штанга',
  foot: 'Опора',
  handle: 'Ручка',
  post: 'Стойка',
  rail: 'Ригель',
  brace: 'Связь жёсткости',
  box: 'Короб',
  upright: 'Стойка перфорированная',
  bracket: 'Кронштейн полки',
  lip: 'Отбортовка полки',
  'price-rail': 'Ценникодержатель',
  'base-front': 'Фронт базы',
  header: 'Карниз',
}

// ────────────────────────────────────────────────────────────────────────────
//  Утилиты
// ────────────────────────────────────────────────────────────────────────────

/** Переведённая запасная подпись роли; неизвестная роль остаётся техническим id */
function roleLabel(role: PartRole): string {
  const ru = ROLE_RU[role]
  return ru ? t(ru) : role
}

const num = (v: number): number => (Number.isFinite(v) ? v : 0)
const r = (v: number, d: number): number => {
  const k = 10 ** d
  return Math.round(num(v) * k) / k
}
const r1 = (v: number): number => Math.round(num(v) * 10) / 10

/**
 * Диаметр и длина цилиндра. Соглашение из types.ts (x — диаметр, y — длина)
 * геометрия соблюдает не везде: у штанги длина лежит в x, у фланца — в y.
 * Надёжный признак — два равных габарита это диаметр, третий длина.
 */
function cylDims(sx: number, sy: number, sz: number): { d: number; len: number } {
  const eq = (a: number, b: number) => Math.abs(a - b) <= 0.51
  if (eq(sy, sz)) return { d: sy, len: sx }
  if (eq(sx, sz)) return { d: sx, len: sy }
  if (eq(sx, sy)) return { d: sx, len: sz }
  return { d: sx, len: sy }
}

// ────────────────────────────────────────────────────────────────────────────
//  Измерение одной детали
// ────────────────────────────────────────────────────────────────────────────

interface Measured {
  /** часть ключа группировки: округлённые размеры */
  groupKey: string
  dims: string
  areaEach: number
  volumeEach: number
  massEach: number
  /** уже в валюте сборки — цена выбрана аксессорами matPrice* */
  priceEach: number
  edgeEach: number
}

/**
 * Листовое считаем по раскроечным размерам и цене за м²,
 * объёмное — по габаритам с поправкой на полость и цене за кг.
 */
function measure(p: Part, m: MaterialDef): Measured {
  const edgeEach = Math.max(0, num(p.edge ?? 0) / 1000)

  if (p.cut) {
    const w = r1(p.cut.w)
    const h = r1(p.cut.h)
    const areaEach = (w * h) / 1e6

    const t = r1(p.cut.t)
    // Листовой металл: цоколь и подобные гнутые детали геометрия задаёт
    // габаритом, а вырезают их из тонкого листа — берём наименьший калибр.
    const metal = m.kind === 'metal'
    const gauge = metal ? Math.min(...m.thicknesses, t) : t
    const fill = metal ? 1 : SHELL_FILL[p.role] ?? 1
    const volumeEach = ((w * h * gauge) / 1e9) * fill
    const massEach = volumeEach * m.density
    return {
      groupKey: `${w}x${h}x${t}`,
      dims: fmtDims(w, h, t),
      areaEach,
      volumeEach,
      massEach,
      priceEach: metal ? massEach * matPriceKg(m) : areaEach * matPriceM2(m),
      edgeEach,
    }
  }

  const sx = r1(p.size.x)
  const sy = r1(p.size.y)
  const sz = r1(p.size.z)
  const cyl = p.shape === 'cylinder'
  const cd = cyl ? cylDims(sx, sy, sz) : null
  // габаритный объём, м³
  const rawVolume = cd
    ? (Math.PI * (cd.d / 2) ** 2 * cd.len) / 1e9
    : (sx * sy * sz) / 1e9
  const volumeEach = rawVolume * (METAL_FILL[p.role] ?? SHELL_FILL[p.role] ?? 1)
  const massEach = volumeEach * m.density
  // нелистовое из плиты (деревянная штанга, короб) оцениваем по эквивалентной
  // площади: габаритный объём, делённый на наименьший размер
  const minDim = Math.max(1, cd ? cd.d : Math.min(sx, sy, sz)) / 1000
  const perKg = matPriceKg(m)
  const priceEach = perKg > 0 ? massEach * perKg : (rawVolume / minDim) * matPriceM2(m)

  return {
    groupKey: cd ? `cyl:${cd.d}x${cd.len}` : `box:${sx}x${sy}x${sz}`,
    dims: cd ? `Ø${fmtDims(cd.d, cd.len)}` : fmtDims(sx, sy, sz),
    areaEach: 0,
    volumeEach,
    massEach,
    priceEach,
    edgeEach,
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Накопитель
// ────────────────────────────────────────────────────────────────────────────

interface Acc {
  lines: Map<string, BomLine>
  hw: Map<string, HardwareLine>
  warnings: Warning[]
  parts: number
  hasGlass: boolean
}

function addPart(acc: Acc, p: Part): number {
  const m = getMaterial(p.materialId)
  const mm = measure(p, m)
  const key = `${p.role}|${m.id}|${mm.groupKey}`

  let line = acc.lines.get(key)
  if (!line) {
    line = {
      key,
      label: p.label || roleLabel(p.role),
      role: p.role,
      materialId: m.id,
      materialName: materialName(m),
      dims: mm.dims,
      qty: 0,
      areaEach: r(mm.areaEach, 4),
      volumeEach: r(mm.volumeEach, 6),
      massEach: r(mm.massEach, 3),
      edgeEach: 0,
      priceEach: r(mm.priceEach, 2),
      areaTotal: 0,
      massTotal: 0,
      edgeTotal: 0,
      priceTotal: 0,
    }
    acc.lines.set(key, line)
  }
  line.qty += 1
  // кромка в группе может отличаться (полка у стены обкатана с трёх сторон),
  // поэтому копим сумму, а edgeEach выводим как среднее при финализации
  line.edgeTotal += mm.edgeEach
  acc.parts += 1
  if (m.kind === 'glass') acc.hasGlass = true

  return line.massEach
}

/** Добавляет фурнитуру, возвращает добавленную массу, кг */
function addHw(acc: Acc, def: HwDef, qty: number): number {
  if (qty <= 0) return 0
  // колонку прайса выбираем один раз здесь — дальше по смете идёт число
  const each = priceOf(def.priceEach)
  let line = acc.hw.get(def.key)
  if (!line) {
    line = {
      key: def.key,
      label: t(def.label),
      qty: 0,
      priceEach: each,
      priceTotal: 0,
      massEach: def.massEach,
    }
    acc.hw.set(def.key, line)
  }
  line.qty += qty
  line.priceTotal = r(line.qty * each, 2)
  return qty * def.massEach
}

// ────────────────────────────────────────────────────────────────────────────
//  Фурнитура из деталей и каркаса
// ────────────────────────────────────────────────────────────────────────────

/** Петель на одну дверь — по её высоте */
function hingesFor(height: number): number {
  if (height < 900) return 2
  if (height <= 1600) return 3
  return 4
}

function addHardware(acc: Acc, unit: ShelfUnit, parts: Part[]): number {
  let mass = 0
  const count = (role: PartRole) => parts.reduce((s, p) => s + (p.role === role ? 1 : 0), 0)

  // Петли. Решётчатый фасад — это десяток деталей роли 'door' с общим motion.group,
  // поэтому считаем не детали, а створки; глухая панель-заглушка петель не требует.
  const doors = new Map<string, { height: number; hinged: boolean }>()
  for (const p of parts) {
    if (p.role !== 'door') continue
    const k = p.motion?.group ?? p.cellKey ?? p.id
    const d = doors.get(k) ?? { height: 0, hinged: false }
    d.height = Math.max(d.height, num(p.size.y))
    d.hinged = d.hinged || p.motion?.kind === 'hinge'
    doors.set(k, d)
  }
  let hinges = 0
  for (const d of doors.values()) if (d.hinged) hinges += hingesFor(d.height)
  mass += addHw(acc, HW.hinge, hinges)

  // направляющие — комплект на ящик
  mass += addHw(acc, HW.slide, count('drawer-front'))

  // ручки
  mass += addHw(acc, HW.handle, count('handle'))

  // конфирматы — 4 на каждую корпусную деталь
  const joints = CONFIRMAT_ROLES.reduce((s, role) => s + count(role), 0)
  mass += addHw(acc, HW.confirmat, joints * 4)

  // полкодержатели — 4 на съёмную полку
  mass += addHw(acc, HW.shelfPin, count('sub-shelf') * 4)

  // регулируемые опоры
  if (unit.frame.feet === 'levelers') {
    const feet = parts.reduce(
      (s, p) => s + (p.role === 'foot' && p.shape === 'cylinder' ? 1 : 0),
      0,
    )
    mass += addHw(acc, HW.leveler, feet)
  }

  // штангодержатели: 2 на штангу, по одной самой длинной штанге на ячейку
  // (короткие rod-детали — это фланцы, они уже учтены в паре держателей)
  const rodByCell = new Map<string, number>()
  for (const p of parts) {
    if (p.role !== 'rod') continue
    const k = p.cellKey ?? p.id
    const len = Math.max(num(p.size.x), num(p.size.y), num(p.size.z))
    rodByCell.set(k, Math.max(rodByCell.get(k) ?? 0, len))
  }
  mass += addHw(acc, HW.rodHolder, rodByCell.size * 2)

  // антиопрокидывание
  if (outerHeight(unit.frame) > 1800) mass += addHw(acc, HW.wallBracket, 2)

  // саморезы задней стенки
  if (parts.some((p) => p.role === 'back')) mass += addHw(acc, HW.screw, 20)

  return mass
}

// ────────────────────────────────────────────────────────────────────────────
//  Сборка
// ────────────────────────────────────────────────────────────────────────────

function build(units: ShelfUnit[]): BomResult {
  const acc: Acc = {
    lines: new Map(),
    hw: new Map(),
    warnings: [],
    parts: 0,
    hasGlass: false,
  }

  for (const unit of units) {
    const geo = getUnitGeometry(unit)
    acc.warnings.push(...geo.warnings)

    let unitMass = 0
    for (const p of geo.parts) unitMass += addPart(acc, p)
    unitMass += addHardware(acc, unit, geo.parts)

    if (unitMass > 120) {
      acc.warnings.push({
        level: 'info',
        code: 'heavy-unit',
        message: t('«{name}»: тяжёлый — понадобится сборка на месте', { name: unit.name }),
        unitId: unit.id,
      })
    }
  }

  // ── финализация строк ──
  const lines = [...acc.lines.values()].map((line): BomLine => {
    const edgeTotal = r(line.edgeTotal, 3)
    return {
      ...line,
      edgeEach: line.qty ? r(edgeTotal / line.qty, 3) : 0,
      edgeTotal,
      areaTotal: r(line.areaEach * line.qty, 4),
      massTotal: r(line.massEach * line.qty, 3),
      priceTotal: r(line.priceEach * line.qty, 2),
    }
  })

  lines.sort(
    (a, b) =>
      a.materialName.localeCompare(b.materialName, INTL_LOCALE) ||
      b.priceTotal - a.priceTotal ||
      a.label.localeCompare(b.label, INTL_LOCALE) ||
      a.key.localeCompare(b.key),
  )

  // ── агрегат по материалам ──
  const byMap = new Map<string, BomResult['byMaterial'][number]>()
  let edgePrice = 0
  for (const line of lines) {
    const m = getMaterial(line.materialId)
    let agg = byMap.get(m.id)
    if (!agg) {
      agg = {
        materialId: m.id,
        materialName: materialName(m),
        area: 0,
        mass: 0,
        edge: 0,
        price: 0,
        sheets: 0,
      }
      byMap.set(m.id, agg)
    }
    agg.area += line.areaTotal
    agg.mass += line.massTotal
    agg.edge += line.edgeTotal
    // price — только материал; кромка живёт отдельной строкой в totals
    agg.price += line.priceTotal
    edgePrice += line.edgeTotal * matEdgePrice(m)
  }

  const byMaterial = [...byMap.values()]
    .map((agg) => {
      const m = getMaterial(agg.materialId)
      const sheetArea = (m.sheet.w * m.sheet.h) / 1e6
      return {
        ...agg,
        area: r(agg.area, 4),
        mass: r(agg.mass, 3),
        edge: r(agg.edge, 3),
        price: r(agg.price, 2),
        sheets:
          m.kind === 'metal' || agg.area <= 0 || sheetArea <= 0
            ? 0
            : Math.ceil(agg.area / sheetArea / SHEET_YIELD),
      }
    })
    .sort((a, b) => b.price - a.price || a.materialName.localeCompare(b.materialName, INTL_LOCALE))

  const hardware = [...acc.hw.values()].filter((h) => h.qty > 0)

  // ── итоги ──
  const area = lines.reduce((s, l) => s + l.areaTotal, 0)
  const partsMass = lines.reduce((s, l) => s + l.massTotal, 0)
  const hwMass = hardware.reduce((s, h) => s + h.qty * h.massEach, 0)
  const edge = lines.reduce((s, l) => s + l.edgeTotal, 0)
  const materialsPrice = lines.reduce((s, l) => s + l.priceTotal, 0)
  const hardwarePrice = hardware.reduce((s, h) => s + h.priceTotal, 0)

  if (acc.hasGlass) {
    acc.warnings.push({
      level: 'info',
      code: 'glass-care',
      message: t('Стекло: закалённое, кромка полировка'),
    })
  }

  return {
    lines,
    hardware,
    byMaterial,
    totals: {
      parts: acc.parts,
      area: r(area, 3),
      mass: r(partsMass + hwMass, 2),
      edge: r(edge, 2),
      materialsPrice: r(materialsPrice, 2),
      hardwarePrice: r(hardwarePrice, 2),
      edgePrice: r(edgePrice, 2),
      price: r(materialsPrice + hardwarePrice + edgePrice, 2),
    },
    warnings: acc.warnings,
  }
}

/** Смета по всем видимым юнитам */
export function computeBom(units: ShelfUnit[]): BomResult {
  return build(units.filter((u) => !u.hidden))
}

/** Смета одного юнита — считается даже если он скрыт */
export function computeUnitBom(unit: ShelfUnit): BomResult {
  return build([unit])
}
