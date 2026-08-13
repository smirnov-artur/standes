/**
 * Кэш THREE-материалов поверх процедурных текстур.
 *
 * Правило номер один: материалы НИКОГДА не создаются в render-цикле напрямую —
 * только через getThreeMaterial / useThreeMaterial, у которых единый глобальный
 * кэш. Ключ включает id материала, качество, модификаторы (ghost/selected) и
 * округлённый физический размер детали (repeat живёт на текстуре, поэтому под
 * каждый размер нужен свой экземпляр материала со СВОИМИ клонами текстур).
 */

import { useMemo } from 'react'
import * as THREE from 'three'

import { getMaterial } from '@/domain/materials'
import { mm } from '@/domain/types'
import type { MaterialDef, Quality, TextureRecipe, Vec3 } from '@/domain/types'
import { useAppStore } from '@/store/useStore'
import { disposeTextures, getTextureSet, roughnessMax } from '@/three/textures'

export interface MatOpts {
  /** полупрозрачный «призрак» (перетаскивание, предпросмотр) */
  ghost?: boolean
  /** подсветка выделения */
  selected?: boolean
  /** габариты детали в мм — нужны, чтобы рисунок был физически верного масштаба */
  size?: Vec3
  /**
   * Перфорация. Решает не материал, а ДЕТАЛЬ: из одного и того же листа RAL
   * делают и дырчатую стойку, и сплошную полку. Флаг приходит из геометрии
   * через Part.perforated.
   */
  perforated?: boolean
}

/** Рецепты с выраженным направлением рисунка — их имеет смысл поворачивать по волокну */
const ANISO = new Set<TextureRecipe>(['wood', 'ply-edge', 'brushed', 'laminate'])

const SELECT_COLOR = '#4d9bff'

// ────────────────────────────────────────────────────────────────────────────
//  Раскладка UV под физический размер детали
// ────────────────────────────────────────────────────────────────────────────

interface UvPlan {
  rx: number
  ry: number
  /** поворот текстуры, чтобы волокно шло вдоль длинной стороны */
  rot: number
  key: string
}

/** Округление до 50 мм — иначе кэш разрастётся на каждый миллиметр */
const snap50 = (v: number) => Math.max(50, Math.round(Math.abs(v) / 50) * 50)

/**
 * Раскладка UV у BoxGeometry: грань ±X даёт (z, y), ±Y — (x, z), ±Z — (x, y).
 * Берём доминирующую грань (перпендикулярную самому тонкому измерению) и
 * подгоняем repeat так, чтобы один тайл = def.grainScale мм.
 */
function uvPlan(size: Vec3, def: MaterialDef): UvPlan {
  const ax = Math.abs(size.x)
  const ay = Math.abs(size.y)
  const az = Math.abs(size.z)
  let lu: number
  let lv: number
  if (ax <= ay && ax <= az) {
    lu = az
    lv = ay
  } else if (ay <= ax && ay <= az) {
    lu = ax
    lv = az
  } else {
    lu = ax
    lv = ay
  }
  lu = snap50(lu)
  lv = snap50(lv)
  const s = Math.max(1, def.grainScale)
  // высокая узкая деталь — волокно должно идти вертикально
  const rotate = ANISO.has(def.texture) && lv > lu * 1.35
  return { rx: lu / s, ry: lv / s, rot: rotate ? Math.PI / 2 : 0, key: `${lu}x${lv}${rotate ? 'r' : ''}` }
}

/** Клонированные текстуры, которыми владеет этот модуль */
const owned = new Set<THREE.Texture>()

/**
 * Текстуры из getTextureSet общие — мутировать их repeat нельзя.
 * Клон делит `source` с оригиналом, поэтому в GPU не уезжает вторая копия пикселей.
 */
function privatize(t: THREE.Texture): THREE.Texture {
  if (!t.userData.shared) return t
  const c = t.clone()
  c.userData = { shared: false }
  owned.add(c)
  return c
}

function applyUv(t: THREE.Texture, p: UvPlan): void {
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.center.set(0.5, 0.5)
  t.rotation = p.rot
  t.repeat.set(p.rx, p.ry)
}

/**
 * Выставляет repeat всех карт материала под физический размер детали
 * (один тайл = def.grainScale мм). Общие текстуры при этом автоматически
 * подменяются приватными клонами, так что чужие материалы не пострадают.
 */
export function repeatFor(mat: THREE.Material, sizeMm: Vec3, def: MaterialDef): void {
  const m = mat as THREE.MeshPhysicalMaterial
  const p = uvPlan(sizeMm, def)
  if (m.map) {
    m.map = privatize(m.map)
    applyUv(m.map, p)
  }
  if (m.normalMap) {
    m.normalMap = privatize(m.normalMap)
    applyUv(m.normalMap, p)
  }
  if (m.roughnessMap) {
    m.roughnessMap = privatize(m.roughnessMap)
    applyUv(m.roughnessMap, p)
  }
  if (m.aoMap) {
    m.aoMap = privatize(m.aoMap)
    applyUv(m.aoMap, p)
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Сборка материала
// ────────────────────────────────────────────────────────────────────────────

function color(hex: string): THREE.Color {
  return new THREE.Color().setStyle(hex, THREE.SRGBColorSpace)
}

function build(def: MaterialDef, quality: Quality, opts: MatOpts): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial()
  m.name = `${def.id}${opts.ghost ? ':ghost' : ''}${opts.selected ? ':sel' : ''}`
  m.color = color(def.color)
  m.side = THREE.FrontSide
  m.metalness = def.metalness
  m.roughness = def.roughness
  m.clearcoat = def.clearcoat
  m.clearcoatRoughness = def.clearcoatRoughness
  m.envMapIntensity = def.kind === 'metal' ? 1.35 : 1.0
  m.dithering = true // без него на больших плоскостях виден бэндинг

  // призрак: никаких карт, всё плоское и полупрозрачное
  if (opts.ghost) {
    m.transparent = true
    m.opacity = 0.28
    m.depthWrite = false
    m.roughness = 0.9
    m.metalness = 0
    m.clearcoat = 0
    return m
  }

  // стекло: transmission вместо тяжёлого MeshTransmissionMaterial
  if (def.kind === 'glass') {
    m.transparent = true
    m.opacity = def.opacity
    m.transmission = 0.92
    m.thickness = mm(6) // 6 мм в метрах сцены
    m.ior = 1.5
    m.roughness = 0.03
    m.metalness = 0
    m.clearcoat = 1
    m.clearcoatRoughness = 0.03
    m.depthWrite = false
    m.side = THREE.DoubleSide
    m.envMapIntensity = 1.2
    if (opts.selected) markSelected(m)
    return m
  }

  const tex = getTextureSet(def, quality, opts.perforated)
  m.map = tex.map
  m.normalMap = tex.normalMap
  m.normalScale = new THREE.Vector2(def.normalScale, def.normalScale)
  // в roughnessMap лежат абсолютные значения, нормированные на roughnessMax
  m.roughnessMap = tex.roughnessMap
  m.roughness = roughnessMax(def)
  if (tex.aoMap) {
    m.aoMap = tex.aoMap
    m.aoMapIntensity = 0.5
  }

  if (def.kind === 'fabric') {
    m.sheen = 0.6
    m.sheenRoughness = 0.9
    m.sheenColor = color(def.color).lerp(new THREE.Color(1, 1, 1), 0.35)
  }

  if (def.transparent) {
    m.transparent = true
    m.opacity = def.opacity
  }

  if (opts.selected) markSelected(m)
  return m
}

function markSelected(m: THREE.MeshPhysicalMaterial): void {
  m.emissive = color(SELECT_COLOR)
  m.emissiveIntensity = 0.16
}

// ────────────────────────────────────────────────────────────────────────────
//  Кэш
// ────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, THREE.Material>()

/**
 * Материал под (id, качество, модификаторы, размер детали).
 * Всегда возвращает один и тот же экземпляр для одинакового ключа.
 */
export function getThreeMaterial(
  materialId: string,
  quality: Quality,
  opts?: MatOpts,
): THREE.Material {
  const def = getMaterial(materialId)
  const o = opts ?? {}
  const plan = o.size ? uvPlan(o.size, def) : null
  const key = `${def.id}|${quality}|${o.ghost ? 'g' : ''}${o.selected ? 's' : ''}${o.perforated ? 'p' : ''}|${plan ? plan.key : '-'}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = build(def, quality, o)
  if (plan) repeatFor(m, o.size!, def)
  cache.set(key, m)
  return m
}

/** React-обёртка: качество берётся из стора */
export function useThreeMaterial(materialId: string, opts?: MatOpts): THREE.Material {
  const quality = useAppStore((s) => s.view.quality)
  const ghost = !!opts?.ghost
  const selected = !!opts?.selected
  const perforated = !!opts?.perforated
  const size = opts?.size
  const sx = size?.x ?? 0
  const sy = size?.y ?? 0
  const sz = size?.z ?? 0
  return useMemo(
    () =>
      getThreeMaterial(materialId, quality, {
        ghost,
        selected,
        perforated,
        size: size ? { x: sx, y: sy, z: sz } : undefined,
      }),
    // размер участвует покомпонентно — объект size может быть новым каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [materialId, quality, ghost, selected, perforated, sx, sy, sz],
  )
}

/** Освобождает материалы и принадлежащие им клоны текстур */
export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose()
  cache.clear()
  for (const t of owned) t.dispose()
  owned.clear()
}

/** Полная очистка GPU-ресурсов модуля (материалы + общие текстуры) */
export function disposeAll(): void {
  disposeMaterials()
  disposeTextures()
}

/** Для отладки */
export function materialCacheSize(): number {
  return cache.size
}
