/**
 * Рендер одной детали стеллажа.
 *
 * Единицы: домен — мм, сцена — метры (mm()).
 * Всё, что анимируется (открывание, разнесение), считается в useFrame прямой
 * мутацией ref-а — без setState и без ререндера React.
 *
 * Иерархия:
 *   <group>            позиция = точка вращения (hinge) или 0; здесь же разнесение и выдвижение
 *     <mesh>           локальная позиция = center - pivot; здесь же собственный поворот детали
 */

import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

import type { Part, PartRole, Quality, ShelfUnit, Vec3 } from '@/domain/types'
import { mm } from '@/domain/types'
import { useThreeMaterial } from '@/three/materials'

/** Максимальное расхождение деталей при explode = 1, мм */
const EXPLODE_MM = 250
/** Скорость сглаживания анимации, 1/сек */
const EASE = 8
/** Деталь меньше этого габарита по всем осям не отбрасывает тень — только шум и стоимость */
const TINY_MM = 20

/**
 * Роли, которые видно вблизи и в упор: им скругляем рёбра.
 * Роли 'panel' в домене нет — заглушка приходит с ролью 'door'.
 */
const ROUND_ROLES = new Set<PartRole>(['door', 'drawer-front', 'top'])

/** Цвет из CSS-переменной темы. Вызывать в useMemo, зависящем от view.theme. */
export function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/**
 * ExtrudeGeometry (её использует RoundedBox) раздаёт UV в мировых единицах,
 * а весь масштаб текстур в проекте рассчитан на 0..1 по доминирующей грани,
 * как у BoxGeometry. Перекладываем UV планарной проекцией — иначе рисунок
 * на фасадах будет крупнее, чем на полках.
 */
function planarUv(geo: THREE.BufferGeometry, size: Vec3): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return

  const ax = Math.abs(size.x)
  const ay = Math.abs(size.y)
  const az = Math.abs(size.z)
  // индексы осей (0=x,1=y,2=z) для u и v: та же конвенция, что в three/materials.uvPlan
  let ui = 0
  let vi = 1
  if (ax <= ay && ax <= az) {
    ui = 2
    vi = 1
  } else if (ay <= ax && ay <= az) {
    ui = 0
    vi = 2
  }

  const min = [bb.min.x, bb.min.y, bb.min.z]
  const span = [
    Math.max(1e-6, bb.max.x - bb.min.x),
    Math.max(1e-6, bb.max.y - bb.min.y),
    Math.max(1e-6, bb.max.z - bb.min.z),
  ]
  const n = pos.count
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    uv[i * 2] = (p[ui] - min[ui]) / span[ui]
    uv[i * 2 + 1] = (p[vi] - min[vi]) / span[vi]
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

export interface PartMeshProps {
  part: Part
  unit: ShelfUnit
  quality: Quality
  ghost: boolean
  /** целевое раскрытие 0..1 */
  open: number
  /** целевое разнесение 0..1 */
  explode: number
  /** нормализованное направление разлёта детали */
  explodeDir: THREE.Vector3
}

export function PartMesh({ part, quality, ghost, open, explode, explodeDir }: PartMeshProps) {
  const grp = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const anim = useRef({ open: 0, explode: 0 })

  const { size, center, motion } = part

  // — габариты в метрах —
  const dims = useMemo<[number, number, number]>(
    () => [mm(size.x), mm(size.y), mm(size.z)],
    [size.x, size.y, size.z],
  )

  // — точка вращения и локальное смещение меша относительно неё —
  const base = useMemo<[number, number, number]>(() => {
    if (motion?.kind === 'hinge' && motion.pivot) {
      return [mm(motion.pivot.x), mm(motion.pivot.y), mm(motion.pivot.z)]
    }
    return [0, 0, 0]
  }, [motion])

  const local = useMemo<[number, number, number]>(
    () => [mm(center.x) - base[0], mm(center.y) - base[1], mm(center.z) - base[2]],
    [center.x, center.y, center.z, base],
  )

  const rotation = useMemo<[number, number, number]>(
    () => (part.rot ? [part.rot.x, part.rot.y, part.rot.z] : [0, 0, 0]),
    [part.rot],
  )

  const axis = useMemo(() => {
    const a = motion?.kind === 'hinge' ? motion.axis : undefined
    return a ? new THREE.Vector3(a.x, a.y, a.z).normalize() : null
  }, [motion])

  // — материал: единый кэш, repeat под физический размер детали —
  // перфорацию назначает ГЕОМЕТРИЯ конкретной детали, а не материал:
  // из одного листа RAL делают и дырчатую стойку, и сплошную полку
  const material = useThreeMaterial(
    part.materialId,
    ghost ? { ghost: true } : { size, perforated: part.perforated },
  )

  const tiny = size.x < TINY_MM && size.y < TINY_MM && size.z < TINY_MM
  const shadows = !part.glass && !ghost && !tiny
  const rounded = part.shape === 'box' && ROUND_ROLES.has(part.role)
  const radius = rounded ? Math.min(0.0025, Math.min(dims[0], dims[1], dims[2]) / 3) : 0

  // UV скруглённых деталей приводим к 0..1 после того, как drei отцентрировал геометрию
  useLayoutEffect(() => {
    if (!rounded) return
    const g = meshRef.current?.geometry
    if (g) planarUv(g, size)
  }, [rounded, radius, size, dims])

  useFrame((_, dt) => {
    const g = grp.current
    if (!g) return
    const a = anim.current
    const still = !motion && explode === 0 && a.explode === 0
    if (still) return

    const k = 1 - Math.exp(-EASE * Math.min(dt, 0.12))
    a.open += (open - a.open) * k
    a.explode += (explode - a.explode) * k
    if (Math.abs(open - a.open) < 1e-4) a.open = open
    if (Math.abs(explode - a.explode) < 1e-4) a.explode = explode

    const ex = mm(EXPLODE_MM) * a.explode
    g.position.set(
      base[0] + explodeDir.x * ex,
      base[1] + explodeDir.y * ex,
      base[2] + explodeDir.z * ex,
    )
    if (motion?.kind === 'slide') g.position.z += mm(motion.travel ?? 0) * a.open
    if (motion?.kind === 'hinge' && axis) {
      g.quaternion.setFromAxisAngle(axis, (motion.maxAngle ?? 0) * a.open)
    }
  })

  const order = part.glass ? 10 : 0

  return (
    <group ref={grp} position={base}>
      {rounded ? (
        <RoundedBox
          ref={meshRef}
          args={dims}
          radius={radius}
          smoothness={2}
          bevelSegments={quality === 'low' ? 1 : 2}
          position={local}
          rotation={rotation}
          material={material}
          castShadow={shadows}
          receiveShadow={shadows}
          renderOrder={order}
        />
      ) : (
        <mesh
          ref={meshRef}
          position={local}
          rotation={rotation}
          material={material}
          castShadow={shadows}
          receiveShadow={shadows}
          renderOrder={order}
        >
          {part.shape === 'cylinder' ? (
            <cylinderGeometry
              args={[mm(size.x) / 2, mm(size.x) / 2, mm(size.y), quality === 'low' ? 10 : 20]}
            />
          ) : (
            <boxGeometry args={dims} />
          )}
        </mesh>
      )}
    </group>
  )
}
