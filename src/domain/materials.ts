import type { MaterialDef } from './types'
import { t } from '@/i18n'
import { type Price, priceOf } from '@/i18n/currency'

/**
 * Каталог материалов. Единственный источник правды для рендера, сметы и веса.
 * Цены — ориентировочные. Правятся здесь и подхватываются везде.
 *
 * ДВА ПРАЙСА. Каждая цена — пара { rub, usd } из двух НЕЗАВИСИМЫХ чисел.
 * Курса в проекте больше нет: долларовая версия не делит рубли на 92, а берёт
 * свою колонку (см. priceOf в '@/i18n/currency').
 *
 * Долларовые значения — СТАРТОВЫЕ: они выведены из рублёвых один раз, в момент
 * разделения прайсов (рубли ÷ 92, округление ВВЕРХ до торговой ступени — 0.5
 * при цене до $10, 1 при $10…100, 5 свыше $100). С этого момента они НИ ОТ ЧЕГО
 * НЕ ЗАВИСЯТ: у экспорта своя логистика, пошлина и маржа, поэтому правьте
 * колонку usd отдельно и не пытайтесь «синхронизировать» её с рублёвой.
 *
 * ПАЛИТРА. Картинка должна читаться как спокойный продуктовый рендер мебели,
 * а не как каталог красок, поэтому насыщенность зажата:
 *   • S (HSL) ≤ 35 % у всех материалов, кроме латуни (44 %) и оливковой эмали —
 *     там цвет и есть смысл материала;
 *   • породы дерева различаются СВЕТЛОТОЙ и рисунком (L: орех 27 → ясень 80),
 *     а не насыщенностью — она у всех в коридоре 20…27 %;
 *   • clearcoat у дерева низкий (0.06…0.16): лак «в зеркало» читается пластиком.
 * Контраст рисунка (grainContrast) — не абсолютный: в textures.ts он умножается
 * на усиление рецепта (дерево ×1.9), поэтому здешние числа заметно ниже единицы.
 */

const sheetLDSP = { w: 2800, h: 2070 }
const sheetPly = { w: 2440, h: 1220 }
const sheetGlass = { w: 2000, h: 1000 }
/** рулонная сталь торгового оборудования: карта раскроя по 1250-й ленте */
const sheetSteel = { w: 2500, h: 1250 }
/** экструдированный лист ABS */
const sheetPlastic = { w: 2000, h: 1000 }

export const MATERIALS: MaterialDef[] = [
  // ── Дерево ───────────────────────────────────────────────────────────────
  {
    id: 'oak',
    name: 'Дуб натуральный',
    kind: 'sheet',
    group: 'Дерево',
    // H 33 · S 26 · L 60 — тёплый, но без «морковного» красного
    color: '#b49c7e',
    roughness: 0.64,
    metalness: 0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.62,
    texture: 'wood',
    grainScale: 900,
    grainContrast: 0.22,
    normalScale: 0.95,
    transparent: false,
    opacity: 1,
    density: 700,
    pricePerM2: { rub: 5400, usd: 59 },
    edgePricePerM: { rub: 260, usd: 3 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [18, 20, 25, 30, 40],
  },
  {
    id: 'walnut',
    name: 'Орех американский',
    kind: 'sheet',
    group: 'Дерево',
    // H 22 · S 26 · L 27 — тёмный, но не бордовый
    color: '#574033',
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.55,
    texture: 'wood',
    grainScale: 800,
    grainContrast: 0.26,
    normalScale: 0.9,
    transparent: false,
    opacity: 1,
    density: 660,
    pricePerM2: { rub: 9800, usd: 110 },
    edgePricePerM: { rub: 420, usd: 5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [18, 20, 25, 30, 40],
  },
  {
    id: 'ash-white',
    name: 'Ясень белёный',
    kind: 'sheet',
    group: 'Дерево',
    // H 36 · S 20 · L 80 — самая светлая порода в наборе
    color: '#d6cec2',
    roughness: 0.68,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.66,
    texture: 'wood',
    grainScale: 950,
    grainContrast: 0.16,
    normalScale: 1,
    transparent: false,
    opacity: 1,
    density: 680,
    pricePerM2: { rub: 6200, usd: 68 },
    edgePricePerM: { rub: 290, usd: 3.5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [18, 20, 25, 30],
  },
  {
    id: 'birch-ply',
    name: 'Фанера берёзовая',
    kind: 'sheet',
    group: 'Дерево',
    // было #d8b98a — S 50 %, пережжённый «янтарь». Стало H 37 · S 23 · L 74
    color: '#ccc0ad',
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.7,
    texture: 'ply-edge',
    grainScale: 700,
    grainContrast: 0.16,
    normalScale: 0.85,
    transparent: false,
    opacity: 1,
    density: 680,
    pricePerM2: { rub: 3100, usd: 34 },
    edgePricePerM: { rub: 180, usd: 2 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [12, 15, 18, 21, 24],
  },

  // ── Плита ────────────────────────────────────────────────────────────────
  {
    id: 'laminate-white',
    name: 'ЛДСП белый',
    kind: 'sheet',
    group: 'Плита',
    // H 40 · S 9 · L 93 — почти нейтральный белый, холоднее стены
    color: '#efeeec',
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.42,
    texture: 'laminate',
    grainScale: 320,
    grainContrast: 0.08,
    normalScale: 0.35,
    transparent: false,
    opacity: 1,
    density: 720,
    pricePerM2: { rub: 1350, usd: 15 },
    edgePricePerM: { rub: 120, usd: 1.5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetLDSP,
    thicknesses: [16, 18, 22, 25],
  },
  {
    id: 'laminate-graphite',
    name: 'ЛДСП графит',
    kind: 'sheet',
    group: 'Плита',
    color: '#33363a',
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.38,
    texture: 'laminate',
    grainScale: 320,
    grainContrast: 0.1,
    normalScale: 0.35,
    transparent: false,
    opacity: 1,
    density: 720,
    pricePerM2: { rub: 1550, usd: 17 },
    edgePricePerM: { rub: 130, usd: 1.5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetLDSP,
    thicknesses: [16, 18, 22, 25],
  },
  {
    id: 'mdf-sand',
    name: 'МДФ эмаль «песок»',
    kind: 'sheet',
    group: 'Плита',
    // H 41 · S 18 · L 72 — «песок», а не охра
    color: '#c4bcab',
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.4,
    texture: 'plain',
    grainScale: 400,
    grainContrast: 0.04,
    normalScale: 0.18,
    transparent: false,
    opacity: 1,
    density: 780,
    pricePerM2: { rub: 3900, usd: 43 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetLDSP,
    thicknesses: [16, 18, 19, 22],
  },
  {
    id: 'mdf-olive',
    name: 'МДФ эмаль «олива»',
    kind: 'sheet',
    group: 'Плита',
    // цветной акцент каталога — S 15 % и так в норме
    color: '#5f6b4f',
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.4,
    texture: 'plain',
    grainScale: 400,
    grainContrast: 0.04,
    normalScale: 0.18,
    transparent: false,
    opacity: 1,
    density: 780,
    pricePerM2: { rub: 3900, usd: 43 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetLDSP,
    thicknesses: [16, 18, 19, 22],
  },
  {
    id: 'hdf-back',
    name: 'ХДФ задняя стенка',
    kind: 'sheet',
    group: 'Плита',
    // H 37 · S 16 · L 64
    color: '#b2a795',
    roughness: 0.82,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 1,
    texture: 'plain',
    grainScale: 300,
    grainContrast: 0.06,
    normalScale: 0.24,
    transparent: false,
    opacity: 1,
    density: 850,
    pricePerM2: { rub: 520, usd: 6 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetLDSP,
    thicknesses: [3, 4, 6, 8],
  },

  // ── Металл ───────────────────────────────────────────────────────────────
  {
    id: 'steel-black',
    name: 'Сталь чёрная матовая',
    kind: 'metal',
    group: 'Металл',
    color: '#25272b',
    roughness: 0.44,
    metalness: 0.92,
    clearcoat: 0.06,
    clearcoatRoughness: 0.55,
    texture: 'powder',
    grainScale: 200,
    grainContrast: 0.06,
    normalScale: 0.25,
    transparent: false,
    opacity: 1,
    density: 7850,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 320, usd: 3.5 },
    sheet: sheetLDSP,
    thicknesses: [1.5, 2, 3],
  },
  {
    id: 'steel-white',
    name: 'Сталь белая матовая',
    kind: 'metal',
    group: 'Металл',
    color: '#e5e4e0',
    roughness: 0.47,
    metalness: 0.85,
    clearcoat: 0.06,
    clearcoatRoughness: 0.55,
    texture: 'powder',
    grainScale: 200,
    grainContrast: 0.05,
    normalScale: 0.25,
    transparent: false,
    opacity: 1,
    density: 7850,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 320, usd: 3.5 },
    sheet: sheetLDSP,
    thicknesses: [1.5, 2, 3],
  },
  {
    id: 'steel-brushed',
    name: 'Нержавейка шлифованная',
    kind: 'metal',
    group: 'Металл',
    color: '#b8bcc0',
    roughness: 0.32,
    metalness: 1,
    clearcoat: 0,
    clearcoatRoughness: 1,
    texture: 'brushed',
    grainScale: 120,
    grainContrast: 0.22,
    normalScale: 0.4,
    transparent: false,
    opacity: 1,
    density: 7900,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 640, usd: 7 },
    sheet: sheetLDSP,
    thicknesses: [1.5, 2, 3],
  },
  {
    id: 'brass',
    name: 'Латунь',
    kind: 'metal',
    group: 'Металл',
    // единственное осознанное исключение по насыщенности: H 44 · S 42 · L 52.
    // Латунь без хромы читается как грязное золото, но 54 % было уже «медью».
    color: '#b89d51',
    roughness: 0.3,
    metalness: 1,
    clearcoat: 0,
    clearcoatRoughness: 1,
    texture: 'brushed',
    grainScale: 100,
    grainContrast: 0.16,
    normalScale: 0.3,
    transparent: false,
    opacity: 1,
    density: 8500,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 1450, usd: 16 },
    sheet: sheetLDSP,
    thicknesses: [1.5, 2, 3],
  },

  // ── Металл торгового оборудования ────────────────────────────────────────
  //
  // Порошковая покраска по RAL — то, из чего собран любой торговый зал.
  // metalness намеренно ниже, чем у «голой» стали (0.85…0.92): полимерное
  // покрытие — диэлектрик, и белая стойка с metalness 0.9 выглядела бы серой,
  // потому что у металла нет диффузной составляющей.
  // Толщины — реальный сортамент торгового оборудования: стойка 1.2…2,
  // полка 0.8…1, задняя стенка 0.5…1 (в каталоге зажато снизу до 0.8).
  {
    id: 'steel-ral9016',
    name: 'Сталь RAL 9016 (белая)',
    kind: 'metal',
    group: 'Металл',
    // RAL 9016 Verkehrsweiß: H 60 · S 9 · L 94 — нейтральный «магазинный» белый
    color: '#f1f1ec',
    roughness: 0.5,
    metalness: 0.45,
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    texture: 'powder',
    grainScale: 200,
    grainContrast: 0.04,
    normalScale: 0.3,
    transparent: false,
    opacity: 1,
    density: 7850,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 200, usd: 2.5 },
    sheet: sheetSteel,
    thicknesses: [0.8, 1, 1.2, 1.5, 2],
  },
  {
    id: 'steel-ral7035',
    name: 'Сталь RAL 7035 (серая)',
    kind: 'metal',
    group: 'Металл',
    // RAL 7035 Lichtgrau: H 200 · S 6 · L 79 — чуть холоднее белого
    color: '#c7cbcd',
    roughness: 0.5,
    metalness: 0.5,
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    texture: 'powder',
    grainScale: 200,
    grainContrast: 0.045,
    normalScale: 0.3,
    transparent: false,
    opacity: 1,
    density: 7850,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 200, usd: 2.5 },
    sheet: sheetSteel,
    thicknesses: [0.8, 1, 1.2, 1.5, 2],
  },
  {
    id: 'steel-ral9005',
    name: 'Сталь RAL 9005 (чёрная)',
    kind: 'metal',
    group: 'Металл',
    // RAL 9005 Tiefschwarz: H 220 · S 6 · L 12 — не абсолютный чёрный,
    // иначе перфорация на нём перестаёт читаться
    color: '#1d1e20',
    roughness: 0.5,
    metalness: 0.6,
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    texture: 'powder',
    grainScale: 200,
    grainContrast: 0.05,
    normalScale: 0.3,
    transparent: false,
    opacity: 1,
    density: 7850,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 200, usd: 2.5 },
    sheet: sheetSteel,
    thicknesses: [0.8, 1, 1.2, 1.5, 2],
  },

  // ── Стекло ───────────────────────────────────────────────────────────────
  {
    id: 'glass-clear',
    name: 'Стекло прозрачное',
    kind: 'glass',
    group: 'Стекло',
    color: '#dfeaee',
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    texture: 'plain',
    grainScale: 1000,
    grainContrast: 0,
    normalScale: 0,
    transparent: true,
    opacity: 0.24,
    density: 2500,
    pricePerM2: { rub: 2800, usd: 31 },
    edgePricePerM: { rub: 380, usd: 4.5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetGlass,
    thicknesses: [4, 5, 6, 8, 10],
  },
  {
    id: 'glass-smoked',
    name: 'Стекло дымчатое',
    kind: 'glass',
    group: 'Стекло',
    color: '#4a4b50',
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    texture: 'plain',
    grainScale: 1000,
    grainContrast: 0,
    normalScale: 0,
    transparent: true,
    opacity: 0.42,
    density: 2500,
    pricePerM2: { rub: 3600, usd: 40 },
    edgePricePerM: { rub: 420, usd: 5 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetGlass,
    thicknesses: [4, 5, 6, 8],
  },

  // ── Прочее ───────────────────────────────────────────────────────────────
  {
    id: 'abs-white',
    name: 'Пластик ABS белый',
    kind: 'sheet',
    group: 'Прочее',
    // ценникодержатели и профили-держатели: чуть теплее и «мягче» стального белого
    color: '#f4f3f0',
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.28,
    texture: 'plain',
    grainScale: 150,
    grainContrast: 0.03,
    normalScale: 0.12,
    transparent: false,
    opacity: 1,
    density: 1050,
    // символическая: реальная стоимость ценникодержателя считается погонажом
    pricePerM2: { rub: 480, usd: 5.5 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPlastic,
    thicknesses: [1, 1.5, 2, 3],
  },
  {
    id: 'felt-grey',
    name: 'Войлок серый',
    kind: 'fabric',
    group: 'Прочее',
    color: '#8a8b86',
    roughness: 0.95,
    metalness: 0,
    clearcoat: 0,
    clearcoatRoughness: 1,
    texture: 'plain',
    grainScale: 60,
    grainContrast: 0.14,
    normalScale: 0.5,
    transparent: false,
    opacity: 1,
    density: 300,
    pricePerM2: { rub: 1800, usd: 20 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [6, 8, 10],
  },
  {
    id: 'concrete-floor',
    name: 'Бетон (пол)',
    kind: 'sheet',
    group: 'Прочее',
    color: '#8e8d8a',
    roughness: 0.88,
    metalness: 0,
    clearcoat: 0.02,
    clearcoatRoughness: 0.9,
    texture: 'plain',
    grainScale: 2500,
    grainContrast: 0.16,
    normalScale: 0.45,
    transparent: false,
    opacity: 1,
    density: 2400,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [50],
  },
  {
    id: 'oak-floor',
    name: 'Дубовый пол',
    kind: 'sheet',
    group: 'Прочее',
    // было #a97f52 (S 34 · L 50) — терракота с глянцем керамогранита.
    // Стало H 34 · S 19 · L 64: светлый спокойный дуб, матовое масло.
    color: '#b5a692',
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.58,
    texture: 'wood',
    grainScale: 1400,
    grainContrast: 0.18,
    normalScale: 0.85,
    transparent: false,
    opacity: 1,
    density: 700,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [20],
  },
  {
    id: 'concrete-light',
    name: 'Бетон светлый',
    kind: 'sheet',
    group: 'Прочее',
    // H 34 · S 7 · L 79 — нейтральный светлый фон, мебель на нём не спорит с полом
    color: '#cdcac6',
    roughness: 0.88,
    metalness: 0,
    clearcoat: 0.03,
    clearcoatRoughness: 0.85,
    texture: 'plain',
    // тайл 3.2 м: на комнате 6×5 м это ~2 повтора — крупные мягкие пятна заливки
    grainScale: 3200,
    grainContrast: 0.16,
    normalScale: 0.45,
    transparent: false,
    opacity: 1,
    density: 2400,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [50],
  },
  {
    id: 'micro-cement',
    name: 'Микроцемент серый',
    kind: 'sheet',
    group: 'Прочее',
    // H 213 · S 5 · L 63 — холодный нейтральный серый, уравновешивает тёплое дерево
    color: '#9ca0a5',
    roughness: 0.8,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.62,
    texture: 'plain',
    grainScale: 2600,
    grainContrast: 0.14,
    normalScale: 0.35,
    transparent: false,
    opacity: 1,
    density: 2200,
    pricePerM2: { rub: 0, usd: 0 },
    edgePricePerM: { rub: 0, usd: 0 },
    pricePerKg: { rub: 0, usd: 0 },
    sheet: sheetPly,
    thicknesses: [10],
  },
]

export const MATERIAL_MAP: Record<string, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
)

const FALLBACK = MATERIAL_MAP['laminate-white']

export function getMaterial(id: string | undefined): MaterialDef {
  if (!id) return FALLBACK
  return MATERIAL_MAP[id] ?? FALLBACK
}

// ────────────────────────────────────────────────────────────────────────────
//  Цены материала в валюте сборки
// ────────────────────────────────────────────────────────────────────────────

/**
 * Аксессоры цены. Потребителям (смета, раскрой, пикер) НЕ нужно знать, что
 * внутри лежит пара rub/usd и какая валюта у сборки — они спрашивают число и
 * получают его уже в нужной валюте. Принимают и сам материал, и его id.
 */
const priceField = (m: MaterialDef | string, pick: (d: MaterialDef) => Price): number =>
  priceOf(pick(typeof m === 'string' ? getMaterial(m) : m))

/** Цена листа за м² в валюте сборки */
export function matPriceM2(m: MaterialDef | string): number {
  return priceField(m, (d) => d.pricePerM2)
}

/** Цена металла за кг в валюте сборки */
export function matPriceKg(m: MaterialDef | string): number {
  return priceField(m, (d) => d.pricePerKg)
}

/** Цена кромления за пог.м в валюте сборки */
export function matEdgePrice(m: MaterialDef | string): number {
  return priceField(m, (d) => d.edgePricePerM)
}

/**
 * Отображаемое имя материала.
 *
 * В каталоге намеренно оставлен русский оригинал: так его видно в коде и в
 * диффах, а сама строка работает ключом словаря. Перевод происходит в момент
 * ЧТЕНИЯ, а не в константе — MATERIALS вычисляется один раз при импорте
 * модуля, и держать там уже переведённое значение значило бы прятать язык
 * в неочевидном месте.
 *
 * Показывать material.name напрямую нельзя нигде: ни в пикере, ни в смете,
 * ни в CSV — только через эту функцию.
 *
 * Принимает и сам материал, и его id, и уже сохранённое где-то русское имя —
 * во всех трёх случаях вернётся одна и та же подпись на языке сборки.
 */
export function materialName(m: MaterialDef | string): string {
  if (typeof m !== 'string') return t(m.name)
  const def = MATERIAL_MAP[m]
  return t(def ? def.name : m)
}

/** Отображаемое имя группы каталога («Дерево» → «Wood») */
export function materialGroup(m: MaterialDef | string): string {
  if (typeof m !== 'string') return t(m.group)
  const def = MATERIAL_MAP[m]
  return t(def ? def.group : m)
}

/** Отображаемое имя группы по её сырому ключу из каталога */
export function groupName(group: string): string {
  return t(group)
}

/** Покрытия, которые бывают только полом — в пикерах корпуса и фасадов им не место */
const FLOOR_ONLY = new Set(['concrete-floor', 'oak-floor', 'concrete-light', 'micro-cement'])

/** Материалы, пригодные для корпуса/полок/фасадов */
export const STRUCTURAL_MATERIALS = MATERIALS.filter(
  (m) => m.kind === 'sheet' || m.kind === 'metal',
).filter((m) => !FLOOR_ONLY.has(m.id))

/**
 * Палитра торгового оборудования: три ходовых RAL порошковой покраски плюс
 * ABS ценникодержателей. Ровно то, что имеет смысл показывать покупателю
 * в клиентском режиме — там выбор должен быть коротким и правдивым.
 */
const RETAIL_IDS = new Set(['steel-ral9016', 'steel-ral7035', 'steel-ral9005', 'abs-white'])

export const RETAIL_MATERIALS: MaterialDef[] = MATERIALS.filter((m) => RETAIL_IDS.has(m.id))

/** Материалы для фасадов — включая стекло */
export const FRONT_MATERIALS = MATERIALS.filter(
  (m) => !FLOOR_ONLY.has(m.id) && m.id !== 'hdf-back',
)

export const FLOOR_MATERIALS = MATERIALS.filter(
  (m) => FLOOR_ONLY.has(m.id) || m.id === 'laminate-white',
)

/**
 * Группировка для UI-пикера.
 * `group` — сырой ключ каталога (годится для React key и сравнений),
 * `groupLabel` — то, что показывают человеку.
 */
export function materialsByGroup(list: MaterialDef[] = MATERIALS) {
  const groups = new Map<string, MaterialDef[]>()
  for (const m of list) {
    if (!groups.has(m.group)) groups.set(m.group, [])
    groups.get(m.group)!.push(m)
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    groupLabel: t(group),
    items,
  }))
}

/** Ближайшая доступная толщина материала к запрошенной */
export function snapThickness(materialId: string, t: number): number {
  const m = getMaterial(materialId)
  let best = m.thicknesses[0] ?? t
  let bestD = Math.abs(best - t)
  for (const th of m.thicknesses) {
    const d = Math.abs(th - t)
    if (d < bestD) {
      best = th
      bestD = d
    }
  }
  return best
}
