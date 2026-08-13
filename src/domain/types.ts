/**
 * STANDES — доменная модель модульного стеллажа.
 *
 * ЕДИНИЦЫ: вся доменная модель — в МИЛЛИМЕТРАХ и РАДИАНАХ.
 * Сцена Three.js — в МЕТРАХ. Конвертация только на границе рендера: `mm * MM`.
 *
 * ЛОКАЛЬНЫЕ ОСИ СТЕЛЛАЖА:
 *   +X — вправо (ширина),  +Y — вверх (высота),  +Z — вперёд, к зрителю (глубина).
 *   Origin юнита = ЦЕНТР пятна застройки на уровне пола (y = 0).
 *   Значит: задняя плоскость z = -depth/2, передняя z = +depth/2,
 *           левая x = -width/2, правая x = +width/2, низ y = 0, верх y = height.
 */

// импорт ТОЛЬКО типа: доменная модель по-прежнему не зависит от i18n в рантайме
import type { Price } from '@/i18n/currency'

export const MM = 0.001
/** мм -> метры сцены */
export const mm = (v: number) => v * MM

export interface Vec2 {
  x: number
  z: number
}
export interface Vec3 {
  x: number
  y: number
  z: number
}

// ────────────────────────────────────────────────────────────────────────────
//  Материалы
// ────────────────────────────────────────────────────────────────────────────

export type MaterialKind = 'sheet' | 'metal' | 'glass' | 'fabric'
export type TextureRecipe = 'wood' | 'laminate' | 'ply-edge' | 'brushed' | 'powder' | 'plain'

export interface MaterialDef {
  id: string
  name: string
  kind: MaterialKind
  /** базовый цвет, hex «#rrggbb» (linear-safe, задаётся как sRGB) */
  color: string
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  /** рецепт процедурной текстуры */
  texture: TextureRecipe
  /** масштаб рисунка в мм (длина одного тайла) */
  grainScale: number
  /** контраст рисунка 0..1 */
  grainContrast: number
  /** сила нормали 0..2 */
  normalScale: number
  transparent: boolean
  opacity: number
  /** плотность, кг/м³ — для расчёта веса */
  density: number
  /**
   * Цены — ПАРОЙ независимых прайсов { rub, usd }, а не одним числом:
   * долларовая версия не пересчитывает рубли по курсу, а держит свой прайс.
   * Читать их напрямую не нужно — есть matPriceM2 / matEdgePrice / matPriceKg
   * в materials.ts, которые сразу отдают число в валюте сборки.
   */
  /** цена листа, за м² (для kind==='sheet' и 'glass') */
  pricePerM2: Price
  /** цена кромки, за пог.м */
  edgePricePerM: Price
  /** цена металла, за кг (для kind==='metal') */
  pricePerKg: Price
  /** стандартный лист для раскроя, мм */
  sheet: { w: number; h: number }
  /** доступные толщины, мм */
  thicknesses: number[]
  /** группа для UI */
  group: 'Дерево' | 'Плита' | 'Металл' | 'Стекло' | 'Прочее'
}

// ────────────────────────────────────────────────────────────────────────────
//  Каркас
// ────────────────────────────────────────────────────────────────────────────

export type FootKind = 'none' | 'plinth' | 'legs-round' | 'legs-hairpin' | 'levelers'
export type BackKind = 'none' | 'full' | 'per-cell'
/** carcass — корпусной (боковины из плиты); steel-frame — каркас из профиля + вкладные полки */
/**
 * carcass     — корпусной: боковины из плиты, задняя стенка, цоколь.
 * steel-frame — каркас из профиля с вкладными полками (лофт).
 * retail      — ТОРГОВЫЙ: перфорированные стойки, задняя стенка, база снизу,
 *               полки на кронштейнах с отбортовкой и ценникодержателем.
 *               Тот самый, что стоит в магазинах.
 */
export type ConstructionStyle = 'carcass' | 'steel-frame' | 'retail'

/**
 * Параметры торгового стеллажа. Применяются только при style === 'retail'.
 * Глубина БАЗЫ берётся из frame.depth — она же задаёт пятно застройки,
 * потому что база всегда самый глубокий элемент.
 */
export interface RetailSpec {
  /** высота базы от пола до её настила, мм */
  baseHeight: number
  /** глубина полок, мм (меньше глубины базы — «лесенкой») */
  shelfDepth: number
  /** наклон полок передним краем вниз, градусы (0…15) */
  tilt: number
  /** высота отбортовки переднего края полки, мм (0 = без бортика) */
  lip: number
  /** ценникодержатель по переднему краю полки */
  priceRail: boolean
  /** перфорация задней стенки (визуально и в названии детали) */
  perforated: boolean
  /** двусторонний островной: полки с обеих сторон, стенка посередине */
  island: boolean
  /** высота верхнего карниза, мм (0 = без карниза) */
  header: number
}

export interface FrameSpec {
  /** ЧИСТЫЕ внутренние ширины колонок (слева направо), мм */
  cols: number[]
  /** ЧИСТЫЕ внутренние высоты рядов (СНИЗУ ВВЕРХ), мм */
  rows: number[]
  /** внешняя глубина корпуса, мм */
  depth: number
  /** толщина внутренних перегородок и полок, мм */
  panel: number
  /** толщина боковин / верха / низа, мм */
  side: number
  back: BackKind
  backThickness: number
  feet: FootKind
  /** высота цоколя/ножек, мм */
  footHeight: number
  /** свес столешницы по бокам и вперёд, мм (0 = вровень) */
  topOverhang: number
  style: ConstructionStyle
  /** сечение профиля для steel-frame и ширина стойки для retail, мм */
  profile: number
  /** диагональные связи жёсткости (steel-frame) */
  braces: boolean
  /**
   * Параметры торгового стеллажа. Необязательное поле: проекты, сохранённые
   * до появления retail, остаются валидными — недостающее добьётся дефолтами
   * через retailSpec() из frame.ts.
   */
  retail?: Partial<RetailSpec>
}

// ────────────────────────────────────────────────────────────────────────────
//  Ячейки
// ────────────────────────────────────────────────────────────────────────────

export type DoorHinge = 'left' | 'right' | 'up'
export type DoorStyle = 'solid' | 'glass' | 'slatted'
export type DrawerFront = 'flat' | 'grooved' | 'handleless'

export type CellFill =
  | { t: 'empty' }
  /** дополнительные промежуточные полки внутри ячейки */
  | { t: 'shelves'; count: number }
  | { t: 'drawers'; count: number; front: DrawerFront }
  | { t: 'door'; hinge: DoorHinge; style: DoorStyle }
  /** вертикальные подперегородки */
  | { t: 'dividers'; count: number }
  /** штанга для одежды */
  | { t: 'rod' }
  /** глухая заглушка-панель заподлицо */
  | { t: 'panel' }
  /** декоративный короб/корзина */
  | { t: 'box'; color?: string }

export type CellFillKind = CellFill['t']

/** Ключ ячейки: `${col}:${row}`, row 0 = НИЖНИЙ ряд */
export type CellKey = string

export interface Cell {
  fill: CellFill
  /** объединение ячеек: сколько колонок/рядов занимает, >= 1 */
  span: { c: number; r: number }
  /** переопределение материала полок/заполнения этой ячейки */
  material?: string
  /** переопределение задней стенки (при frame.back === 'per-cell') */
  back?: boolean
}

export const cellKey = (c: number, r: number): CellKey => `${c}:${r}`
export const parseCellKey = (k: CellKey): { c: number; r: number } => {
  const [c, r] = k.split(':')
  return { c: Number(c), r: Number(r) }
}

export const DEFAULT_CELL: Cell = { fill: { t: 'empty' }, span: { c: 1, r: 1 } }

// ────────────────────────────────────────────────────────────────────────────
//  Юнит (один стеллаж)
// ────────────────────────────────────────────────────────────────────────────

export interface UnitMaterials {
  /** боковины, верх, низ, перегородки */
  carcass: string
  /** полки */
  shelf: string
  /** задняя стенка */
  back: string
  /** фасады: двери и фронты ящиков */
  front: string
  /** ножки, штанги, ручки */
  accent: string
}

export interface ShelfUnit {
  id: string
  name: string
  /** позиция ЦЕНТРА пятна застройки в координатах комнаты, мм */
  pos: Vec2
  /** поворот вокруг Y, радианы */
  rotY: number
  frame: FrameSpec
  cells: Record<CellKey, Cell>
  materials: UnitMaterials
  locked: boolean
  hidden: boolean
  /**
   * Высота установки: расстояние от ПОЛА до НИЗА юнита, мм. По умолчанию 0.
   *
   * Так работает штабелирование: юнит, поставленный на другой, получает
   * elevation === unitTopY(нижнего). Поле НЕОБЯЗАТЕЛЬНОЕ намеренно — проекты
   * и ссылки, сохранённые до появления штабеля, остаются валидными, а весь код
   * читает высоту через elevationOf(u) из frame.ts (там же зажим в [0, 6000]).
   * Напрямую `u.elevation` читать не нужно: undefined встречается сплошь и рядом.
   */
  elevation?: number
  /** id группы «сцепленных» магнитами юнитов (двигаются вместе) */
  groupId?: string
}

// ────────────────────────────────────────────────────────────────────────────
//  Производная геометрия (то, что рендерится и попадает в смету)
// ────────────────────────────────────────────────────────────────────────────

export type PartRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'divider'
  | 'shelf'
  | 'sub-shelf'
  | 'sub-divider'
  | 'back'
  | 'plinth'
  | 'door'
  | 'drawer-front'
  | 'drawer-side'
  | 'drawer-bottom'
  | 'rod'
  | 'foot'
  | 'handle'
  | 'post'
  | 'rail'
  | 'brace'
  | 'box'
  // ── торговый стеллаж ──
  /** перфорированная стойка */
  | 'upright'
  /** кронштейн полки */
  | 'bracket'
  /** отбортовка переднего края полки */
  | 'lip'
  /** ценникодержатель */
  | 'price-rail'
  /** фронтальная панель базы */
  | 'base-front'
  /** верхний карниз */
  | 'header'

export type PartShape = 'box' | 'cylinder'

/** Анимация подвижной детали (дверь, ящик) */
export interface PartMotion {
  kind: 'hinge' | 'slide'
  /** точка вращения в локальных координатах юнита, мм (для hinge) */
  pivot?: Vec3
  /** ось вращения, единичный вектор (для hinge) */
  axis?: Vec3
  /** максимальный угол, радианы (для hinge) */
  maxAngle?: number
  /** ход выдвижения по +Z, мм (для slide) */
  travel?: number
  /** детали с одинаковым group двигаются как одно целое */
  group: string
}

export interface Part {
  id: string
  role: PartRole
  shape: PartShape
  /** габариты параллелепипеда, мм. Для cylinder: x = диаметр, y = длина, z = диаметр */
  size: Vec3
  /** центр детали в локальных координатах юнита, мм */
  center: Vec3
  /** доп. поворот детали, радианы (обычно нулевой) */
  rot?: Vec3
  materialId: string
  cellKey?: CellKey
  motion?: PartMotion
  /**
   * Плоская деталь для раскроя: w × h при толщине t (мм).
   * Задаётся только для листовых деталей; металлопрокат и штанги — нет.
   */
  cut?: { w: number; h: number; t: number }
  /** длина кромки, пог. мм */
  edge?: number
  /** прозрачная деталь (стекло) — рендерить последней, без теней */
  glass?: boolean
  /**
   * Деталь перфорирована (торговый стеллаж: стойки и задняя стенка).
   * Решает геометрия, а не материал: из одного листа RAL делают и дырчатую
   * стойку, и сплошную полку — материал у них один и тот же.
   */
  perforated?: boolean
  /** человекочитаемое имя для сметы */
  label: string
}

/** Полный результат разбора юнита в детали */
export interface UnitGeometry {
  parts: Part[]
  /** внешние габариты, мм */
  outer: Vec3
  /** позиции разделительных линий по X (внутренние границы колонок), мм от левого края */
  colBounds: number[]
  /** позиции по Y (границы рядов), мм от пола */
  rowBounds: number[]
  /** прямоугольники видимых (не поглощённых span-ом) ячеек в локальных координатах */
  cellRects: CellRect[]
  /** ключи ячеек, поглощённых объединением */
  covered: Set<CellKey>
  /** предупреждения инженерной проверки */
  warnings: Warning[]
}

export interface CellRect {
  key: CellKey
  c: number
  r: number
  span: { c: number; r: number }
  /** чистый внутренний проём, мм, в локальных координатах юнита */
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  cell: Cell
}

export interface Warning {
  level: 'info' | 'warn' | 'error'
  code: string
  message: string
  unitId?: string
  cellKey?: CellKey
}

// ────────────────────────────────────────────────────────────────────────────
//  Магниты / примагничивание
// ────────────────────────────────────────────────────────────────────────────

export type FaceId = 'left' | 'right' | 'front' | 'back'
export type AnchorKind = 'corner' | 'face'

export interface Anchor {
  id: string
  unitId: string
  kind: AnchorKind
  /** для kind==='corner': индекс угла 0..3 (BL, BR, FR, FL в локальных осях) */
  corner?: 0 | 1 | 2 | 3
  face: FaceId
  /** мировые координаты XZ, мм */
  world: Vec2
  /** внешняя нормаль грани в мире, единичный вектор XZ */
  normal: Vec2
  /** внешняя высота юнита, мм — для оценки совместимости */
  height: number
  depth: number
  width: number
}

/** 'stack' — поставить юнит СВЕРХУ на другой (единственный вертикальный тип) */
export type SnapKind = 'face' | 'corner' | 'wall' | 'grid' | 'angle' | 'stack'

export interface SnapCandidate {
  kind: SnapKind
  /** предлагаемая позиция центра пятна, мм */
  pos: Vec2
  /** предлагаемый поворот, радианы */
  rotY: number
  /**
   * Высота, на которую встанет юнит (мм от пола до его низа). ОБЯЗАТЕЛЬНОЕ поле:
   * каждый генератор кандидатов решает судьбу высоты явно — боковые стыки несут
   * текущую высоту юнита, 'stack' — крышку нижнего, а падение на пол даёт 0.
   */
  elevation: number
  /** чем меньше — тем лучше */
  cost: number
  /** id юнита-партнёра (или 'wall:<side>' / 'grid') */
  partnerId: string
  myAnchorId?: string
  partnerAnchorId?: string
  /** линия контакта для подсветки, мировые XZ, мм */
  contact?: [Vec2, Vec2]
  /** точки магнитов, которые «щёлкнули» — для эффекта */
  sparks?: Vec2[]
  label: string
}

export interface SnapSettings {
  enabled: boolean
  /** примагничивание к другим юнитам */
  magnets: boolean
  /** радиус срабатывания магнита, мм */
  magnetRadius: number
  /** привязка к сетке */
  grid: boolean
  gridSize: number
  /** привязка угла поворота */
  angle: boolean
  angleStep: number
  /** примагничивание к стенам комнаты */
  walls: boolean
  /** запрет пересечений */
  collide: boolean
  /** ставить юниты ДРУГ НА ДРУГА (кандидаты kind === 'stack') */
  stack: boolean
}

// ────────────────────────────────────────────────────────────────────────────
//  Комната
// ────────────────────────────────────────────────────────────────────────────

export interface Room {
  /** внутренние размеры, мм */
  width: number
  depth: number
  height: number
  wallThickness: number
  floorMaterial: string
  wallColor: string
  /** 'auto' — прячет стены, обращённые к камере */
  walls: 'none' | 'auto' | 'all'
  ceiling: boolean
  /** плинтус */
  skirting: number
}

// ────────────────────────────────────────────────────────────────────────────
//  Смета
// ────────────────────────────────────────────────────────────────────────────

export interface BomLine {
  key: string
  label: string
  role: PartRole
  materialId: string
  materialName: string
  /** размеры одной детали, мм (для листовых: w × h × t) */
  dims: string
  qty: number
  /** площадь одной детали, м² */
  areaEach: number
  /** объём одной детали, м³ */
  volumeEach: number
  /** масса одной детали, кг */
  massEach: number
  /** кромка одной детали, пог.м */
  edgeEach: number
  /** цена одной детали, ₽ */
  priceEach: number
  areaTotal: number
  massTotal: number
  edgeTotal: number
  priceTotal: number
}

export interface HardwareLine {
  key: string
  label: string
  qty: number
  priceEach: number
  priceTotal: number
  massEach: number
}

export interface BomResult {
  lines: BomLine[]
  hardware: HardwareLine[]
  byMaterial: {
    materialId: string
    materialName: string
    area: number
    mass: number
    edge: number
    price: number
    sheets: number
  }[]
  totals: {
    parts: number
    area: number
    mass: number
    edge: number
    materialsPrice: number
    hardwarePrice: number
    edgePrice: number
    price: number
  }
  warnings: Warning[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Раскрой
// ────────────────────────────────────────────────────────────────────────────

export interface CutPiece {
  id: string
  label: string
  w: number
  h: number
  x: number
  y: number
  rotated: boolean
}

export interface CutSheet {
  index: number
  materialId: string
  materialName: string
  w: number
  h: number
  thickness: number
  pieces: CutPiece[]
  /** коэффициент использования 0..1 */
  usage: number
}

export interface CutlistResult {
  sheets: CutSheet[]
  unplaced: { label: string; w: number; h: number }[]
  totalSheets: number
  averageUsage: number
}

// ────────────────────────────────────────────────────────────────────────────
//  Проект и вид
// ────────────────────────────────────────────────────────────────────────────

export interface Project {
  version: 1
  id: string
  name: string
  units: ShelfUnit[]
  room: Room
  createdAt: number
  updatedAt: number
}

export type ViewMode = '3d' | 'plan' | 'front'
export type Quality = 'low' | 'medium' | 'high' | 'ultra'
export type InspectorTab = 'frame' | 'cells' | 'materials' | 'transform' | 'room'

export interface ViewSettings {
  mode: ViewMode
  quality: Quality
  theme: 'dark' | 'light'
  showGrid: boolean
  showDimensions: boolean
  showMagnets: boolean
  showRoom: boolean
  ghost: boolean
  /** 0..1 — раскрытие дверей и выдвижение ящиков */
  open: number
  /** 0..1 — разнесение деталей */
  explode: number
  /** фон/окружение */
  env: 'studio' | 'loft' | 'warm' | 'night'
}

export interface Selection {
  units: string[]
  cell: { unitId: string; key: CellKey } | null
}
