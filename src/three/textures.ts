/**
 * Процедурные PBR-текстуры. Ни одного внешнего ассета — всё рисуется на canvas
 * детерминированным хеш-шумом (seed из id материала).
 *
 * ВСЕ карты БЕСШОВНЫЕ: шум периодический по (x mod P, y mod P), поэтому тайл
 * стыкуется сам с собой при любом repeat.
 *
 *   map          — sRGB, цвет: интерполяция base / base×0.52 / base×1.15
 *   normalMap    — линейная, Sobel по карте высот, r=x g=y b=z (0.5-based)
 *   roughnessMap — линейная, АБСОЛЮТНАЯ шероховатость, нормированная на roughnessMax(def)
 *   aoMap        — линейная, cavity из карты высот (только дерево и фанера)
 *
 * Генерация ленивая и кэшируется по (def.id + quality). Если canvas недоступен
 * (SSR, тесты в node) — возвращаются 1×1 нейтральные текстуры.
 */

import * as THREE from 'three'
import type { MaterialDef, Quality, TextureRecipe } from '@/domain/types'

export interface TexSet {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  aoMap?: THREE.Texture
}

/** Разрешение текстуры по уровню качества */
const SIZE: Record<Quality, number> = { low: 256, medium: 512, high: 1024, ultra: 2048 }

/** Рельеф рецепта. Умножается на material.normalScale = def.normalScale уже в шейдере. */
const BUMP: Record<TextureRecipe, number> = {
  wood: 2.2,
  'ply-edge': 1.8,
  laminate: 0.5,
  brushed: 0.8,
  powder: 2.0,
  plain: 1,
}

/** Разброс шероховатости рецепта относительно def.roughness */
const ROUGH_SPAN: Record<TextureRecipe, number> = {
  wood: 0.22,
  'ply-edge': 0.16,
  laminate: 0.06,
  brushed: 0.22,
  powder: 0.1,
  plain: 0.08,
}

/**
 * Усиление контраста ЦВЕТА для рецепта: во сколько раз def.grainContrast
 * превращается в реальную амплитуду в paintColor.
 *
 * Зачем: у дерева рисунок обязан читаться, но задирать grainContrast в каталоге
 * нельзя — там же он отвечает за «пёстрость» материала в целом. Поэтому в
 * каталоге дерево живёт на спокойных 0.16…0.26, а сюда приходит с ×1.9.
 * Остальные рецепты — ×1, их числа абсолютны.
 */
const COLOR_GAIN: Record<TextureRecipe, number> = {
  wood: 1.9,
  'ply-edge': 1.5,
  laminate: 1,
  brushed: 1,
  powder: 1,
  plain: 1,
}

const TAU = Math.PI * 2
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/**
 * Верхняя граница шероховатости материала. roughnessMap хранит значения,
 * нормированные на неё, а material.roughness = roughnessMax — тогда
 * произведение в шейдере даёт физически заданную абсолютную шероховатость.
 */
export function roughnessMax(def: MaterialDef): number {
  return clamp(def.roughness + ROUGH_SPAN[def.texture], 0.04, 1)
}

// ────────────────────────────────────────────────────────────────────────────
//  Детерминированный хеш-шум
// ────────────────────────────────────────────────────────────────────────────

function strSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Целочисленный хеш -> 0..1 */
function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Периодический 1D value-noise (для анизотропных штрихов; зовётся по строкам) */
function vn1(x: number, p: number, s: number): number {
  const xi = x | 0
  const f = x - xi
  const u = f * f * f * (f * (f * 6 - 15) + 10)
  const i0 = xi % p
  const i1 = i0 + 1 === p ? 0 : i0 + 1
  const a = hash2(i0, 0, s)
  const b = hash2(i1, 0, s)
  return a + (b - a) * u
}

/**
 * Октава fBm: решётка случайных значений px×py, заполненная один раз.
 * Табличная выборка вместо хеша в каждом пикселе — генерация вдвое быстрее.
 */
interface Oct {
  lat: Float32Array
  px: number
  py: number
  amp: number
}

interface FbmPlan {
  octs: Oct[]
  /** 1 / сумма амплитуд */
  inv: number
}

/**
 * План fBm с раздельными периодами по осям (анизотропия) и ограничением `cap`.
 * cap = четверть разрешения (≥4 px на ячейку шума): более мелкие октавы дают
 * только алиасинг и всё равно съедаются мипмапами, поэтому частота там
 * зажимается, а накопление прекращается.
 * Периоды всегда ЦЕЛЫЕ — отсюда бесшовность тайла.
 */
function fbmPlan(pu: number, pv: number, oct: number, seed: number, cap: number): FbmPlan {
  let a = pu < cap ? pu : cap
  let b = pv < cap ? pv : cap
  let amp = 1
  let norm = 0
  const octs: Oct[] = []
  for (let i = 0; i < oct; i++) {
    const s = seed + i * 1013
    const lat = new Float32Array(a * b)
    for (let y = 0; y < b; y++) {
      const row = y * a
      for (let x = 0; x < a; x++) lat[row + x] = hash2(x, y, s)
    }
    octs.push({ lat, px: a, py: b, amp })
    norm += amp
    amp *= 0.5
    if (a >= cap && b >= cap) break
    a = a * 2 < cap ? a * 2 : cap
    b = b * 2 < cap ? b * 2 : cap
  }
  return { octs, inv: norm > 0 ? 1 / norm : 0 }
}

/** Выборка fBm в точке (u, v) ∈ [0,1)² */
function fbmAt(p: FbmPlan, u: number, v: number): number {
  const octs = p.octs
  let sum = 0
  for (let i = 0; i < octs.length; i++) {
    const o = octs[i]
    const px = o.px
    const py = o.py
    const x = u * px
    const y = v * py
    const xi = x | 0
    const yi = y | 0
    const fx = x - xi
    const fy = y - yi
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    const x0 = xi % px
    const y0 = yi % py
    const x1 = x0 + 1 === px ? 0 : x0 + 1
    const y1 = y0 + 1 === py ? 0 : y0 + 1
    const lat = o.lat
    const r0 = y0 * px
    const r1 = y1 * px
    const a = lat[r0 + x0]
    const b = lat[r0 + x1]
    const c = lat[r1 + x0]
    const d = lat[r1 + x1]
    const q0 = a + (b - a) * ux
    const q1 = c + (d - c) * ux
    sum += o.amp * (q0 + (q1 - q0) * uy)
  }
  return sum * p.inv
}

// ────────────────────────────────────────────────────────────────────────────
//  Поля: тон (цвет), высота (нормаль), шероховатость
// ────────────────────────────────────────────────────────────────────────────

interface Fields {
  /** 0..1, 0.5 = базовый цвет материала */
  tone: Float32Array
  /** 0..1, карта высот для Sobel */
  height: Float32Array
  /** абсолютная шероховатость 0..1 */
  rough: Float32Array
  /**
   * Маска отверстий перфорации 0..1 (1 = внутри прорези). Есть только у стоек
   * торгового стеллажа. Цвет отверстия нельзя выразить через `tone`: его
   * амплитуду зажимает grainContrast материала, а дырка обязана быть чёрной,
   * поэтому маска доезжает до paintColor отдельным полем.
   */
  perf?: Float32Array
}

/**
 * Годовые кольца + продольная свиль + сучки.
 *
 * Рисунок собран из ТРЁХ слагаемых, и это принципиально:
 *   line = ring⁸ — узкая тёмная линия поздней древесины. На полупериоде она
 *          занимает ~19 % шага кольца, то есть читается именно как ЛИНИЯ,
 *          а не как размытый градиент (прежний ring⁴ давал 26 % — «мыло»);
 *   band = ring² — широкая мягкая тональная зона вокруг линии, объём;
 *   pore — высокочастотная составляющая (поры и сердцевинные лучи), домен
 *          растянут 1:13 вдоль волокна. Она даёт мелкий «шорох» на крупных
 *          плоскостях: без неё полка вблизи выглядит крашеной.
 */
function fWood(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const RINGS = 24 // целое число колец на тайл — иначе шов
  const base = def.roughness

  // 2..4 сучка, вытянутых вдоль волокна
  const kn = 2 + ((hash2(3, 7, seed) * 3) | 0)
  const ku = new Float64Array(kn)
  const kv = new Float64Array(kn)
  const kr = new Float64Array(kn)
  const ks = new Float64Array(kn)
  for (let i = 0; i < kn; i++) {
    ku[i] = hash2(i, 11, seed)
    kv[i] = hash2(i, 23, seed ^ 0x9e3779b1)
    kr[i] = 0.05 + hash2(i, 31, seed) * 0.06
    ks[i] = (hash2(i, 41, seed) < 0.5 ? -1 : 1) * (4 + hash2(i, 53, seed) * 5)
  }

  // домен растянут 1:14 вдоль волокна (ось U)
  const pWarp = fbmPlan(2, 28, 5, seed, cap)
  const pFine = fbmPlan(6, 84, 4, seed + 977, cap)
  // поры: те же целые периоды, поэтому тайл остаётся бесшовным
  const pPore = fbmPlan(18, 234, 3, seed + 1861, cap)

  for (let y = 0; y < N; y++) {
    const v = y / N
    const vr = v * RINGS
    const row = y * N
    for (let x = 0; x < N; x++) {
      const u = x / N
      const warp = fbmAt(pWarp, u, v)
      const fine = fbmAt(pFine, u, v)
      const pore = fbmAt(pPore, u, v)
      // поры чуть «дышат» по фазе кольца — линия перестаёт быть машинной
      let t = vr + (warp - 0.5) * 3.4 + (fine - 0.5) * 0.7 + (pore - 0.5) * 0.14

      // сучки изгибают домен — кольца обтекают их
      let kd = 0
      for (let i = 0; i < kn; i++) {
        let du = u - ku[i]
        du -= Math.round(du)
        let dv = v - kv[i]
        dv -= Math.round(dv)
        du *= 0.42 // эллипс вдоль волокна
        const d = Math.sqrt(du * du + dv * dv)
        const r = kr[i]
        if (d < r) {
          const q = 1 - d / r
          const sm = q * q * (3 - 2 * q)
          t += sm * ks[i]
          kd += sm * sm
        }
      }

      const ring = 0.5 - 0.5 * Math.cos(t * TAU)
      const r2 = ring * ring
      const r4 = r2 * r2
      const line = r4 * r4 // pow(ring,8) — тонкая контрастная линия
      const band = r2 // широкая мягкая зона вокруг неё

      const i = row + x
      f.tone[i] = clamp01(
        0.66 -
          line * 0.72 -
          band * 0.14 +
          (pore - 0.5) * 0.24 +
          (fine - 0.5) * 0.22 +
          (warp - 0.5) * 0.16 -
          kd * 0.42,
      )
      f.height[i] = clamp01(
        0.68 - line * 0.7 - band * 0.12 + (pore - 0.5) * 0.28 + (fine - 0.5) * 0.2 - kd * 0.32,
      )
      // тёмная линия чуть более шероховатая: блик по доске «дышит», а не течёт ровно
      f.rough[i] = base + line * 0.14 + band * 0.03 + kd * 0.03 + (pore - 0.5) * 0.05
    }
  }
}

/** Торец фанеры: слоистая полоса по V, спокойный мелкий рисунок, светлее */
function fPly(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const LAYERS = 11
  const base = def.roughness
  const pFib = fbmPlan(4, 56, 4, seed + 131, cap)
  const pSpec = fbmPlan(24, 24, 2, seed + 313, cap)
  // высокочастотное волокно внутри шпона — торец фанеры без него мыльный
  const pMicro = fbmPlan(12, 190, 3, seed + 743, cap)

  for (let y = 0; y < N; y++) {
    const v = y / N
    const row = y * N
    // слой шпона и клеевая линия — зависят только от V.
    // Линия задана косинусом: гладкая, без алиасинга и без шва на границе тайла.
    const lay = v * LAYERS
    const lt = hash2(lay | 0, 5, seed)
    const band = 0.5 + 0.5 * Math.cos(lay * TAU)
    const b2 = band * band * band
    const glue = b2 * b2

    for (let x = 0; x < N; x++) {
      const u = x / N
      const fib = fbmAt(pFib, u, v)
      const spec = fbmAt(pSpec, u, v)
      const micro = fbmAt(pMicro, u, v)
      const i = row + x
      f.tone[i] = clamp01(
        0.66 +
          (lt - 0.5) * 0.14 +
          (fib - 0.5) * 0.26 +
          (micro - 0.5) * 0.2 +
          (spec - 0.5) * 0.1 -
          glue * 0.48,
      )
      f.height[i] = clamp01(
        0.62 + (fib - 0.5) * 0.28 + (micro - 0.5) * 0.24 + (spec - 0.5) * 0.16 - glue * 0.44,
      )
      f.rough[i] = base + glue * 0.12 + (fib - 0.5) * 0.05 + (micro - 0.5) * 0.04
    }
  }
}

/** ЛДСП: очень мелкое равномерное зерно + едва заметные продольные штрихи */
function fLaminate(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const base = def.roughness
  const pGrain = fbmPlan(96, 96, 3, seed, cap)
  const pStrk = fbmPlan(3, 128, 3, seed + 61, cap)
  for (let y = 0; y < N; y++) {
    const v = y / N
    const row = y * N
    for (let x = 0; x < N; x++) {
      const u = x / N
      const grain = fbmAt(pGrain, u, v)
      const strk = fbmAt(pStrk, u, v)
      const i = row + x
      f.tone[i] = clamp01(0.5 + (grain - 0.5) * 0.6 + (strk - 0.5) * 0.3)
      f.height[i] = clamp01(0.5 + (grain - 0.5) * 0.85 + (strk - 0.5) * 0.2)
      f.rough[i] = base + (grain - 0.5) * 0.05 + (strk - 0.5) * 0.03
    }
  }
}

/** Шлифованный металл: анизотропные штрихи вдоль U, сильная вариация roughness */
function fBrushed(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const base = def.roughness
  // штрихи 1D — вдоль U они когерентны, поэтому им можно вдвое более мелкую сетку
  const fine = N >> 1
  const p1 = Math.min(48, fine)
  const p2 = Math.min(160, fine)
  const p3 = Math.min(420, fine)
  // лёгкое 2D-дрожание (1:60), чтобы штрихи не были идеально прямыми
  const pJit = fbmPlan(2, 120, 3, seed + 7, cap)
  for (let y = 0; y < N; y++) {
    const v = y / N
    const row = y * N
    // 3 октавы 1D-шума поперёк направления шлифовки — штрихи идут вдоль U
    const streak =
      vn1(v * p1, p1, seed) * 0.5 +
      vn1(v * p2, p2, seed + 31) * 0.32 +
      vn1(v * p3, p3, seed + 61) * 0.18
    for (let x = 0; x < N; x++) {
      const u = x / N
      const jit = fbmAt(pJit, u, v)
      const val = streak * 0.72 + jit * 0.28
      const i = row + x
      f.tone[i] = clamp01(0.5 + (val - 0.5) * 0.22) // map почти ровный
      f.height[i] = clamp01(val)
      f.rough[i] = base + (val - 0.5) * 0.36 // главное для металла
    }
  }
}

/** Порошковая краска: «апельсиновая корка» — плавный рельеф, ровный цвет */
function fPowder(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const base = def.roughness
  const pPeel = fbmPlan(26, 26, 3, seed, cap)
  const pMicro = fbmPlan(110, 110, 2, seed + 211, cap)
  for (let y = 0; y < N; y++) {
    const v = y / N
    const row = y * N
    for (let x = 0; x < N; x++) {
      const u = x / N
      const peel = fbmAt(pPeel, u, v)
      const micro = fbmAt(pMicro, u, v)
      const i = row + x
      f.tone[i] = clamp01(0.5 + (peel - 0.5) * 0.14 + (micro - 0.5) * 0.1)
      f.height[i] = clamp01(0.5 + (peel - 0.5) + (micro - 0.5) * 0.25)
      f.rough[i] = base + (peel - 0.5) * 0.07 + (micro - 0.5) * 0.05
    }
  }
}

// ── Перфорация торговых стоек ───────────────────────────────────────────────
//
// TextureRecipe — часть доменного контракта, нового значения там не завести,
// поэтому перфорация — это НАДСТРОЙКА над рецептом 'powder' для материалов
// торгового оборудования (id начинается на 'steel-ral'). Порошковая корка
// остаётся нетронутой, поверх неё пробиваются прорези.

/** Шаг перфорации по вертикали, мм — тот самый стандартный шаг торговых стоек */
const PERF_PITCH_V = 25
/** Шаг по горизонтали, мм */
const PERF_PITCH_H = 50
/** Габарит одной прорези (вертикальный овал), мм */
const PERF_SLOT_H = 12
const PERF_SLOT_W = 5

/**
 * Может ли этот материал вообще нести перфорацию.
 *
 * ВАЖНО: сам по себе материал перфорацию НЕ включает. Перфорированы только
 * СТОЙКИ и ЗАДНЯЯ СТЕНКА — их помечает геометрия флагом Part.perforated.
 * Полки, фронт базы, кронштейны и карниз делают из того же листа RAL, но
 * сплошными. Раньше эта функция решала всё сама по id материала, и дырки
 * лезли на каждую стальную деталь, включая нижнюю панель базы.
 */
export function canPerforate(def: MaterialDef): boolean {
  return def.texture === 'powder' && def.id.startsWith('steel-ral')
}

/**
 * Маска прорезей + продавливание их в height/rough.
 *
 * Бесшовность: число рядов и колонок на тайл ЦЕЛОЕ (grainScale кратен шагу),
 * центры прорезей стоят в центрах ячеек, поэтому ни одна прорезь не пересекает
 * границу тайла и рисунок стыкуется сам с собой при любом repeat.
 *
 * Форма — «стадион» (капсула): SDF расстояния до вертикального отрезка длиной
 * (H−W) с радиусом W/2. Овал без острых углов, как настоящая пробивка.
 */
function fPerf(def: MaterialDef, N: number, f: Fields): Float32Array {
  const tile = Math.max(PERF_PITCH_H, def.grainScale) // мм на тайл
  const rows = Math.max(1, Math.round(tile / PERF_PITCH_V))
  const cols = Math.max(1, Math.round(tile / PERF_PITCH_H))
  const cellH = tile / rows // мм
  const cellW = tile / cols
  const rad = PERF_SLOT_W / 2
  const seg = Math.max(0, PERF_SLOT_H / 2 - rad)
  // смягчение края — не меньше полутора пикселей, иначе на low-качестве алиасинг
  const edge = Math.max(0.3, (tile / N) * 1.5)
  const mask = new Float32Array(N * N)

  for (let y = 0; y < N; y++) {
    const cv = (y / N) * rows
    const dvRaw = (cv - Math.floor(cv) - 0.5) * cellH
    const dv = Math.max(Math.abs(dvRaw) - seg, 0)
    const row = y * N
    for (let x = 0; x < N; x++) {
      const cu = (x / N) * cols
      const du = (cu - Math.floor(cu) - 0.5) * cellW
      const d = Math.sqrt(du * du + dv * dv) - rad
      if (d >= 0) continue
      const t = clamp01(-d / edge)
      const m = t * t * (3 - 2 * t)
      const i = row + x
      mask[i] = m
      // заметное углубление: Sobel по height даст выраженную фаску по кромке
      f.height[i] = clamp01(f.height[i] - m * 0.85)
      // внутри пробивки металл рваный и матовый
      f.rough[i] = f.rough[i] + m * 0.14
    }
  }
  return mask
}

/**
 * Почти ровная поверхность: слабый шум против «пластиковой» стерильности.
 *
 * Три масштаба. Главный здесь — САМЫЙ крупный (период 5 на тайл): на бетонном
 * полу тайл 2.6–3.2 м, значит пятно заливки выходит ~0.6 м. Без него большая
 * плоскость превращается в равномерную заливку и выдаёт CG; мелкий шум эту
 * работу не делает — он съедается мипмапами уже в паре метров от камеры.
 */
function fPlain(def: MaterialDef, N: number, seed: number, f: Fields): void {
  const cap = N >> 2
  const base = def.roughness
  const pHuge = fbmPlan(5, 5, 2, seed + 1531, cap)
  const pBig = fbmPlan(18, 18, 3, seed, cap)
  const pSml = fbmPlan(80, 80, 2, seed + 409, cap)
  for (let y = 0; y < N; y++) {
    const v = y / N
    const row = y * N
    for (let x = 0; x < N; x++) {
      const u = x / N
      const huge = fbmAt(pHuge, u, v)
      const big = fbmAt(pBig, u, v)
      const sml = fbmAt(pSml, u, v)
      const i = row + x
      f.tone[i] = clamp01(0.5 + (huge - 0.5) * 0.62 + (big - 0.5) * 0.34 + (sml - 0.5) * 0.2)
      f.height[i] = clamp01(0.5 + (huge - 0.5) * 0.5 + (big - 0.5) * 0.55 + (sml - 0.5) * 0.4)
      f.rough[i] = base + (huge - 0.5) * 0.05 + (big - 0.5) * 0.04
    }
  }
}

function buildFields(def: MaterialDef, N: number, perforated: boolean): Fields {
  const n = N * N
  const f: Fields = {
    tone: new Float32Array(n),
    height: new Float32Array(n),
    rough: new Float32Array(n),
  }
  const seed = strSeed(def.id)
  switch (def.texture) {
    case 'wood':
      fWood(def, N, seed, f)
      break
    case 'ply-edge':
      fPly(def, N, seed, f)
      break
    case 'laminate':
      fLaminate(def, N, seed, f)
      break
    case 'brushed':
      fBrushed(def, N, seed, f)
      break
    case 'powder':
      fPowder(def, N, seed, f)
      break
    case 'plain':
      fPlain(def, N, seed, f)
      break
  }
  if (perforated && canPerforate(def)) f.perf = fPerf(def, N, f)
  return f
}

// ────────────────────────────────────────────────────────────────────────────
//  Растеризация полей в пиксели
// ────────────────────────────────────────────────────────────────────────────

function hexBytes(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const s =
    h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      : h.padEnd(6, 'f').slice(0, 6)
  const v = parseInt(s, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * Цвет: base ↔ base×0.52 ↔ base×1.15, амплитуда = grainContrast × COLOR_GAIN.
 *
 * Рамка НЕсимметрична намеренно: рисунок дерева — это тёмные линии на светлом
 * поле, светлая половина нужна лишь чтобы поле не было плоским. Прежние 0.62
 * не давали линии уйти достаточно глубоко, и волокно тонуло.
 */
function paintColor(def: MaterialDef, N: number, tone: Float32Array, out: Uint8ClampedArray): void {
  const [br, bg, bb] = hexBytes(def.color)
  const dr = br * 0.52
  const dg = bg * 0.52
  const db = bb * 0.52
  const lr = Math.min(255, br * 1.15)
  const lg = Math.min(255, bg * 1.15)
  const lb = Math.min(255, bb * 1.15)
  const amp = clamp01(def.grainContrast * COLOR_GAIN[def.texture])
  const n = N * N
  for (let i = 0; i < n; i++) {
    const k = (tone[i] - 0.5) * 2 * amp
    const o = i << 2
    if (k >= 0) {
      out[o] = br + (lr - br) * k
      out[o + 1] = bg + (lg - bg) * k
      out[o + 2] = bb + (lb - bb) * k
    } else {
      const m = -k
      out[o] = br + (dr - br) * m
      out[o + 1] = bg + (dg - bg) * m
      out[o + 2] = bb + (db - bb) * m
    }
    out[o + 3] = 255
  }
}

/**
 * Отверстия перфорации в map: сквозь стойку видно тень, а не краску, поэтому
 * пиксель уводится почти в чёрный поверх уже нарисованного цвета. Делать это
 * через `tone` нельзя — там амплитуду зажимает grainContrast материала.
 */
function paintPerfHoles(N: number, mask: Float32Array, out: Uint8ClampedArray): void {
  const n = N * N
  for (let i = 0; i < n; i++) {
    const m = mask[i]
    if (m <= 0) continue
    const o = i << 2
    out[o] += (9 - out[o]) * m
    out[o + 1] += (9 - out[o + 1]) * m
    out[o + 2] += (10 - out[o + 2]) * m
  }
}

/**
 * Нормаль из карты высот через Sobel (с оборачиванием — шов не появляется).
 * Знак Y положительный: строки картинки растут вниз, а V вверх (flipY = true).
 */
function paintNormal(
  def: MaterialDef,
  N: number,
  h: Float32Array,
  out: Uint8ClampedArray,
): void {
  // gain ∝ N: градиент на пиксель падает с ростом разрешения
  const g = (BUMP[def.texture] * N) / 512 / 8
  for (let y = 0; y < N; y++) {
    const ym = (y === 0 ? N - 1 : y - 1) * N
    const y0 = y * N
    const yp = (y === N - 1 ? 0 : y + 1) * N
    for (let x = 0; x < N; x++) {
      const xm = x === 0 ? N - 1 : x - 1
      const xp = x === N - 1 ? 0 : x + 1
      const h00 = h[ym + xm]
      const h10 = h[ym + x]
      const h20 = h[ym + xp]
      const h01 = h[y0 + xm]
      const h21 = h[y0 + xp]
      const h02 = h[yp + xm]
      const h12 = h[yp + x]
      const h22 = h[yp + xp]
      const dx = h20 + 2 * h21 + h22 - (h00 + 2 * h01 + h02)
      const dy = h02 + 2 * h12 + h22 - (h00 + 2 * h10 + h20)
      const nx = -dx * g
      const ny = dy * g
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const o = (y0 + x) << 2
      out[o] = (nx * inv * 0.5 + 0.5) * 255
      out[o + 1] = (ny * inv * 0.5 + 0.5) * 255
      out[o + 2] = (inv * 0.5 + 0.5) * 255
      out[o + 3] = 255
    }
  }
}

function paintRough(def: MaterialDef, N: number, r: Float32Array, out: Uint8ClampedArray): void {
  const max = roughnessMax(def)
  const n = N * N
  for (let i = 0; i < n; i++) {
    const v = clamp01(r[i] / max) * 255
    const o = i << 2
    out[o] = v
    out[o + 1] = v
    out[o + 2] = v
    out[o + 3] = 255
  }
}

/** Cavity-AO: насколько пиксель ниже локального среднего */
function paintAo(N: number, h: Float32Array, out: Uint8ClampedArray): void {
  for (let y = 0; y < N; y++) {
    const ym = (y === 0 ? N - 1 : y - 1) * N
    const y0 = y * N
    const yp = (y === N - 1 ? 0 : y + 1) * N
    for (let x = 0; x < N; x++) {
      const xm = x === 0 ? N - 1 : x - 1
      const xp = x === N - 1 ? 0 : x + 1
      const avg =
        (h[ym + xm] +
          h[ym + x] +
          h[ym + xp] +
          h[y0 + xm] +
          h[y0 + x] +
          h[y0 + xp] +
          h[yp + xm] +
          h[yp + x] +
          h[yp + xp]) /
        9
      const ao = clamp(1 - (avg - h[y0 + x]) * 2.4, 0.35, 1) * 255
      const o = (y0 + x) << 2
      out[o] = ao
      out[o + 1] = ao
      out[o + 2] = ao
      out[o + 3] = 255
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Текстуры three
// ────────────────────────────────────────────────────────────────────────────

function paintToCanvas(N: number, fill: (px: Uint8ClampedArray) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = N
  c.height = N
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const img = ctx.createImageData(N, N)
  fill(img.data)
  ctx.putImageData(img, 0, 0)
  return c
}

function texFrom(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 16 // рендерер зажмёт до своего максимума
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.userData.shared = true
  t.needsUpdate = true
  return t
}

/** 1×1 заглушка, когда canvas недоступен (node / SSR) */
function flatTex(r: number, g: number, b: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.userData.shared = true
  t.needsUpdate = true
  return t
}

function fallbackSet(): TexSet {
  return {
    map: flatTex(255, 255, 255, true),
    normalMap: flatTex(128, 128, 255, false),
    roughnessMap: flatTex(255, 255, 255, false),
  }
}

function generate(def: MaterialDef, N: number, perforated: boolean): TexSet {
  const f = buildFields(def, N, perforated)
  const wantAo = def.texture === 'wood' || def.texture === 'ply-edge'
  const perf = f.perf
  const map = texFrom(
    paintToCanvas(N, (px) => {
      paintColor(def, N, f.tone, px)
      if (perf) paintPerfHoles(N, perf, px)
    }),
    true,
  )
  const normalMap = texFrom(
    paintToCanvas(N, (px) => paintNormal(def, N, f.height, px)),
    false,
  )
  const roughnessMap = texFrom(
    paintToCanvas(N, (px) => paintRough(def, N, f.rough, px)),
    false,
  )
  const aoMap = wantAo
    ? texFrom(
        paintToCanvas(N, (px) => paintAo(N, f.height, px)),
        false,
      )
    : undefined
  return { map, normalMap, roughnessMap, aoMap }
}

// ────────────────────────────────────────────────────────────────────────────
//  Кэш
// ────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, TexSet>()

/**
 * Комплект карт для материала. Кэшируется по (def.id + quality + перфорация).
 * Вариант перфорации обязан быть в ключе: иначе набор, собранный для стойки,
 * достался бы обычной стали с тем же id — и дырки протекли бы на гладкий металл.
 */
export function getTextureSet(
  def: MaterialDef,
  quality: Quality,
  perforated = false,
): TexSet {
  const key = `${def.id}|${quality}${perforated && canPerforate(def) ? '|perf' : ''}`
  const hit = cache.get(key)
  if (hit) return hit
  let set: TexSet
  try {
    if (typeof document === 'undefined') throw new Error('no document')
    set = generate(def, SIZE[quality] ?? 512, perforated && canPerforate(def))
  } catch {
    set = fallbackSet()
  }
  cache.set(key, set)
  return set
}

/** Освобождает GPU-ресурсы всех сгенерированных текстур и очищает кэш. */
export function disposeTextures(): void {
  for (const s of cache.values()) {
    s.map.dispose()
    s.normalMap.dispose()
    s.roughnessMap.dispose()
    s.aoMap?.dispose()
  }
  cache.clear()
}

/**
 * Сбрасывает кэш БЕЗ dispose — когда текстуры ещё держат живые материалы
 * (например, при смене качества: старые материалы освободят их сами).
 */
export function clearTextureCache(): void {
  cache.clear()
}

/** Для отладки */
export function textureCacheSize(): number {
  return cache.size
}
