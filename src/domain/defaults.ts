import type {
  Cell,
  CellKey,
  FrameSpec,
  Project,
  Room,
  ShelfUnit,
  SnapSettings,
  UnitMaterials,
  ViewSettings,
} from './types'
import { cellKey } from './types'
import { t } from '@/i18n'

let seq = 0
export function uid(prefix = 'u'): string {
  seq += 1
  return `${prefix}_${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export const DEFAULT_FRAME: FrameSpec = {
  cols: [400, 400, 400],
  rows: [360, 360, 360, 360],
  depth: 340,
  panel: 18,
  side: 18,
  back: 'full',
  backThickness: 6,
  feet: 'plinth',
  footHeight: 60,
  topOverhang: 0,
  style: 'carcass',
  profile: 30,
  braces: false,
}

/**
 * Готовый каркас ТОРГОВОГО стеллажа — пристенная секция 1080 × 2000 × 500.
 * С него стартует клиентский режим, на нём же построены retail-пресеты.
 *
 * Размерная арифметика для style 'retail' (см. effThickness/bodyHeight):
 *   боковина = profile = 40, «полка» по сетке = RETAIL_SLOT = 25.
 *   высота = footHeight 20 + 40·2 + Σrows 1800 + 25·4 = 2000 ровно;
 *   ширина = 40·2 + 1000 = 1080.
 * Пять проёмов по 360 мм — это шаг полки 385 мм, стандартная торговая выкладка.
 *
 * ВНИМАНИЕ: объект общий. При создании юнита копируйте массивы и retail:
 *   { ...DEFAULT_RETAIL_FRAME, cols: [...], rows: [...], retail: { ... } }
 */
export const DEFAULT_RETAIL_FRAME: FrameSpec = {
  cols: [1000],
  rows: [360, 360, 360, 360, 360],
  depth: 500,
  // panel/side для 'retail' не участвуют в сетке (её держат profile и
  // RETAIL_SLOT), но остаются осмысленными при переключении стиля обратно
  panel: 25,
  side: 40,
  back: 'full',
  backThickness: 1.5,
  feet: 'levelers',
  footHeight: 20,
  topOverhang: 0,
  style: 'retail',
  profile: 40,
  braces: false,
  retail: {
    baseHeight: 120,
    tilt: 0,
    lip: 25,
    priceRail: true,
    perforated: true,
    island: false,
    header: 0,
  },
}

/** Палитра торговой секции по умолчанию: белый RAL 9016 + серый акцент */
export const DEFAULT_RETAIL_MATERIALS: UnitMaterials = {
  carcass: 'steel-ral9016',
  shelf: 'steel-ral9016',
  back: 'steel-ral9016',
  front: 'steel-ral9016',
  accent: 'steel-ral7035',
}

export const DEFAULT_MATERIALS: UnitMaterials = {
  carcass: 'birch-ply',
  shelf: 'birch-ply',
  back: 'hdf-back',
  front: 'laminate-graphite',
  accent: 'steel-black',
}

export const DEFAULT_ROOM: Room = {
  width: 6000,
  depth: 5000,
  height: 2900,
  wallThickness: 120,
  // нейтральный светлый бетон честнее показывает мебель, чем тёплое дерево:
  // пол не спорит с фасадами и не тащит всю картинку в тёплый тон
  floorMaterial: 'concrete-light',
  // H 30 · S 15 · L 92 — чуть теплее и темнее чистого белого,
  // чтобы белый ЛДСП (L 93, S 9) читался на стене как отдельная плоскость
  wallColor: '#eeebe8',
  walls: 'auto',
  ceiling: false,
  skirting: 80,
}

export const DEFAULT_VIEW: ViewSettings = {
  mode: '3d',
  quality: 'high',
  theme: 'dark',
  showGrid: true,
  showDimensions: false,
  showMagnets: true,
  showRoom: true,
  ghost: false,
  open: 0,
  explode: 0,
  env: 'studio',
}

export const DEFAULT_SNAP: SnapSettings = {
  enabled: true,
  magnets: true,
  magnetRadius: 260,
  grid: true,
  gridSize: 50,
  angle: true,
  angleStep: Math.PI / 12, // 15°
  walls: true,
  collide: true,
  stack: true,
}

export function makeUnit(partial: Partial<ShelfUnit> = {}): ShelfUnit {
  return {
    id: uid('unit'),
    // имя юнита СОХРАНЯЕТСЯ в проект, поэтому переводится в момент создания,
    // а не при отрисовке: в русской сборке проект остаётся русским
    name: t('Стеллаж'),
    pos: { x: 0, z: 0 },
    rotY: 0,
    frame: { ...DEFAULT_FRAME, cols: [...DEFAULT_FRAME.cols], rows: [...DEFAULT_FRAME.rows] },
    cells: {},
    materials: { ...DEFAULT_MATERIALS },
    locked: false,
    hidden: false,
    ...partial,
  }
}

function cellsFrom(spec: Record<CellKey, Cell>): Record<CellKey, Cell> {
  return spec
}

const C = (fill: Cell['fill'], span?: { c: number; r: number }): Cell => ({
  fill,
  span: span ?? { c: 1, r: 1 },
})

// ────────────────────────────────────────────────────────────────────────────
//  Пресеты — библиотека готовых стеллажей
// ────────────────────────────────────────────────────────────────────────────

/**
 * Пресет библиотеки.
 *
 * ЯЗЫК. Разделение намеренное и держится на том, куда строка попадает дальше:
 *   • `name` и `hint` — витринные подписи карточки. Живут в константе как
 *     русский оригинал и переводятся В МЕСТЕ ОТРИСОВКИ: t(preset.name),
 *     t(preset.hint). Переводы лежат в src/i18n/en.ts.
 *   • имя ЮНИТА внутри make() сохраняется в проект и уезжает в .json, ссылку
 *     и печатный бланк, поэтому переводится здесь, в момент создания.
 */
export interface Preset {
  id: string
  /** русский оригинал — ключ словаря; показывать через t(preset.name) */
  name: string
  /** русский оригинал — ключ словаря; показывать через t(preset.hint) */
  hint: string
  make: () => ShelfUnit
}

export const PRESETS: Preset[] = [
  // ── Торговое оборудование ────────────────────────────────────────────────
  // Первыми в библиотеке: заказчик пришёл именно за торговыми стеллажами.
  // Все габариты — реальный сортамент: ширина секции 1000/1250, высота 2000/2200,
  // глубина базы 500/600, шаг полки 385/340, база 120 от пола.
  {
    id: 'retail-wall-1000',
    name: 'Пристенный 1000×2000',
    hint: 'Стандартная секция торгового зала',
    make: () =>
      makeUnit({
        name: t('Пристенный 1000'),
        frame: {
          ...DEFAULT_RETAIL_FRAME,
          cols: [1000],
          rows: [360, 360, 360, 360, 360],
          retail: { ...DEFAULT_RETAIL_FRAME.retail },
        },
        materials: { ...DEFAULT_RETAIL_MATERIALS },
      }),
  },
  {
    id: 'retail-wall-1250',
    name: 'Пристенный 1250×2200',
    hint: 'Высокая секция под крупный товар',
    make: () =>
      makeUnit({
        name: t('Пристенный 1250'),
        frame: {
          ...DEFAULT_RETAIL_FRAME,
          cols: [1250],
          // 20 + 40·2 + 1975 + 25·5 = 2200 ровно; нижний проём крупнее — под коробы
          rows: [425, 310, 310, 310, 310, 310],
          depth: 600,
          retail: { ...DEFAULT_RETAIL_FRAME.retail, shelfDepth: 500 },
        },
        materials: { ...DEFAULT_RETAIL_MATERIALS },
      }),
  },
  {
    id: 'retail-island',
    name: 'Островной двусторонний',
    hint: 'Проход с двух сторон',
    make: () =>
      makeUnit({
        name: t('Островной'),
        frame: {
          ...DEFAULT_RETAIL_FRAME,
          cols: [1250],
          // 20 + 40·2 + 1600 + 25·3 = 1775: ниже пристенных, зал просматривается
          rows: [400, 400, 400, 400],
          // пятно застройки = полка + стенка + полка
          depth: 2 * 400 + 2,
          backThickness: 2,
          retail: { ...DEFAULT_RETAIL_FRAME.retail, island: true },
        },
        materials: { ...DEFAULT_RETAIL_MATERIALS, accent: 'steel-ral9005' },
      }),
  },
  {
    id: 'retail-slope',
    name: 'С наклонными полками',
    hint: 'Наклон 10° под выкладку',
    make: () =>
      makeUnit({
        name: t('Наклонный'),
        frame: {
          ...DEFAULT_RETAIL_FRAME,
          cols: [1000],
          rows: [360, 360, 360, 360, 360],
          // высокая отбортовка держит фрукты и хлеб на наклонной полке
          retail: { ...DEFAULT_RETAIL_FRAME.retail, tilt: 10, lip: 40 },
        },
        materials: { ...DEFAULT_RETAIL_MATERIALS },
      }),
  },

  // ── Корпусная и каркасная мебель ─────────────────────────────────────────
  {
    id: 'open-3x4',
    name: 'Открытый 3×4',
    hint: 'Классика: 12 открытых ячеек, фанера',
    make: () =>
      makeUnit({
        name: t('Открытый 3×4'),
        frame: { ...DEFAULT_FRAME, cols: [400, 400, 400], rows: [360, 360, 360, 360] },
      }),
  },
  {
    id: 'sideboard',
    name: 'Комод-тумба',
    hint: 'Низкий, ящики + дверцы, столешница со свесом',
    make: () =>
      makeUnit({
        name: t('Комод'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [420, 420, 420],
          rows: [400, 400],
          depth: 420,
          side: 20,
          topOverhang: 20,
          feet: 'legs-hairpin',
          footHeight: 180,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'oak', shelf: 'oak', front: 'mdf-olive' },
        cells: cellsFrom({
          [cellKey(0, 0)]: C({ t: 'drawers', count: 2, front: 'handleless' }),
          [cellKey(1, 0)]: C({ t: 'drawers', count: 2, front: 'handleless' }),
          [cellKey(2, 0)]: C({ t: 'drawers', count: 2, front: 'handleless' }),
          [cellKey(0, 1)]: C({ t: 'door', hinge: 'left', style: 'solid' }),
          [cellKey(1, 1)]: C({ t: 'empty' }),
          [cellKey(2, 1)]: C({ t: 'door', hinge: 'right', style: 'solid' }),
        }),
      }),
  },
  {
    id: 'vitrine',
    name: 'Витрина',
    hint: 'Высокая, стеклянные дверцы, подсветка полок',
    make: () =>
      makeUnit({
        name: t('Витрина'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [460, 460],
          rows: [420, 420, 420, 420],
          depth: 380,
          feet: 'plinth',
          footHeight: 80,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'walnut', shelf: 'glass-clear', front: 'glass-clear' },
        cells: cellsFrom({
          [cellKey(0, 3)]: C({ t: 'door', hinge: 'left', style: 'glass' }),
          [cellKey(1, 3)]: C({ t: 'door', hinge: 'right', style: 'glass' }),
          [cellKey(0, 2)]: C({ t: 'door', hinge: 'left', style: 'glass' }),
          [cellKey(1, 2)]: C({ t: 'door', hinge: 'right', style: 'glass' }),
          [cellKey(0, 0)]: C({ t: 'door', hinge: 'left', style: 'solid' }),
          [cellKey(1, 0)]: C({ t: 'door', hinge: 'right', style: 'solid' }),
        }),
      }),
  },
  {
    id: 'industrial',
    name: 'Каркасный лофт',
    hint: 'Стальной профиль + вкладные полки, связи жёсткости',
    make: () =>
      makeUnit({
        name: t('Каркасный'),
        frame: {
          ...DEFAULT_FRAME,
          style: 'steel-frame',
          cols: [700, 700],
          rows: [420, 420, 420, 420],
          depth: 400,
          profile: 30,
          panel: 25,
          side: 30,
          back: 'none',
          feet: 'levelers',
          footHeight: 20,
          braces: true,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'steel-black', shelf: 'oak', accent: 'steel-black' },
      }),
  },
  {
    id: 'wardrobe',
    name: 'Гардероб',
    hint: 'Штанга, антресоль, ящики',
    make: () =>
      makeUnit({
        name: t('Гардероб'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [560, 400],
          rows: [700, 700, 400],
          depth: 580,
          side: 18,
          feet: 'plinth',
          footHeight: 80,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'laminate-white', shelf: 'laminate-white', front: 'laminate-white' },
        cells: cellsFrom({
          [cellKey(0, 0)]: C({ t: 'rod' }, { c: 1, r: 2 }),
          [cellKey(1, 0)]: C({ t: 'drawers', count: 3, front: 'flat' }),
          [cellKey(1, 1)]: C({ t: 'shelves', count: 2 }),
          [cellKey(0, 2)]: C({ t: 'door', hinge: 'up', style: 'solid' }),
          [cellKey(1, 2)]: C({ t: 'door', hinge: 'up', style: 'solid' }),
        }),
      }),
  },
  {
    id: 'cube-4x4',
    name: 'Куб 4×4',
    hint: 'Квадратные ячейки под коробы',
    make: () =>
      makeUnit({
        name: t('Куб 4×4'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [340, 340, 340, 340],
          rows: [340, 340, 340, 340],
          depth: 380,
          feet: 'none',
          footHeight: 0,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'laminate-graphite', shelf: 'laminate-graphite' },
        cells: cellsFrom({
          [cellKey(1, 0)]: C({ t: 'box' }),
          [cellKey(3, 1)]: C({ t: 'box' }),
          [cellKey(0, 2)]: C({ t: 'box' }),
          [cellKey(2, 3)]: C({ t: 'box' }),
        }),
      }),
  },
  {
    id: 'desk-hutch',
    name: 'Стол-надстройка',
    hint: 'Широкий пролёт-столешница с надстройкой',
    make: () =>
      makeUnit({
        name: t('Рабочее место'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [500, 500, 500],
          rows: [720, 300, 300],
          depth: 600,
          side: 25,
          panel: 25,
          topOverhang: 0,
          feet: 'levelers',
          footHeight: 20,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'ash-white', shelf: 'ash-white', accent: 'brass' },
        cells: cellsFrom({
          [cellKey(0, 0)]: C({ t: 'drawers', count: 3, front: 'handleless' }),
          [cellKey(1, 0)]: C({ t: 'empty' }, { c: 2, r: 1 }),
          [cellKey(0, 1)]: C({ t: 'shelves', count: 1 }),
          [cellKey(1, 1)]: C({ t: 'dividers', count: 2 }),
          [cellKey(2, 1)]: C({ t: 'door', hinge: 'up', style: 'slatted' }),
        }),
      }),
  },
  {
    id: 'tall-pantry',
    name: 'Пенал',
    hint: 'Узкий и высокий, полностью закрытый',
    make: () =>
      makeUnit({
        name: t('Пенал'),
        frame: {
          ...DEFAULT_FRAME,
          cols: [400],
          rows: [500, 500, 500, 500],
          depth: 380,
          feet: 'plinth',
          footHeight: 100,
        },
        materials: { ...DEFAULT_MATERIALS, carcass: 'mdf-sand', shelf: 'mdf-sand', front: 'mdf-sand' },
        cells: cellsFrom({
          [cellKey(0, 0)]: C({ t: 'door', hinge: 'right', style: 'solid' }, { c: 1, r: 2 }),
          [cellKey(0, 2)]: C({ t: 'door', hinge: 'right', style: 'slatted' }, { c: 1, r: 2 }),
        }),
      }),
  },
]

export function makeProject(): Project {
  const now = Date.now()
  const first = PRESETS[0].make()
  first.pos = { x: 0, z: 0 }
  return {
    version: 1,
    id: uid('proj'),
    name: t('Новый проект'),
    units: [first],
    room: { ...DEFAULT_ROOM },
    createdAt: now,
    updatedAt: now,
  }
}
