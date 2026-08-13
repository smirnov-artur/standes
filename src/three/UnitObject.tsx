/**
 * Один стеллаж в сцене: трансформ, детали, рамка выделения, подпись, пикер ячеек.
 *
 * Позиция (включая высоту установки) во время перетаскивания берётся из drag.live
 * прямо в useFrame — стор при драге меняется каждый кадр, и ререндер React здесь
 * недопустим.
 */

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'

import { elevationOf } from '@/domain/frame'
import { getUnitGeometry } from '@/domain/geometry'
import { mm } from '@/domain/types'
import { appState, useAppStore, useUnit } from '@/store/useStore'
import { CellPicker } from '@/three/CellPicker'
import { PartMesh, themeColor } from '@/three/PartMesh'
import { requestFocus } from '@/three/registry'

/**
 * Метка служебной ветки: экспорт GLB гасит такие объекты (см. export/gltf.ts).
 * Рамки, подписи и пикер ячеек живут внутри sceneRegistry.content, поэтому без
 * этой метки они уехали бы в модель заказчика.
 */
const SERVICE = { noExport: true } as const

/** отступ рамки от габарита, мм */
const OUTLINE_PAD = 8
/** длина «уголка» в вершинах рамки, м */
const TICK = 0.055

type Pt = [number, number, number]

/** запасное направление разлёта для детали в самом центре юнита */
const UP = new THREE.Vector3(0, 1, 0)

/** 12 рёбер габаритного параллелепипеда как несвязные отрезки */
function boxSegments(hw: number, y0: number, y1: number, hd: number): Pt[] {
  const pts: Pt[] = []
  for (const x of [-hw, hw]) {
    for (const z of [-hd, hd]) pts.push([x, y0, z], [x, y1, z])
  }
  for (const y of [y0, y1]) {
    for (const z of [-hd, hd]) pts.push([-hw, y, z], [hw, y, z])
    for (const x of [-hw, hw]) pts.push([x, y, -hd], [x, y, hd])
  }
  return pts
}

/** Короткие толстые «уголки» в 8 вершинах — читается дороже сплошной рамки */
function cornerTicks(hw: number, y0: number, y1: number, hd: number, len: number): Pt[] {
  const pts: Pt[] = []
  const ys: Array<[number, number]> = [
    [y0, 1],
    [y1, -1],
  ]
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const [y, sy] of ys) {
        const x = sx * hw
        const z = sz * hd
        pts.push([x, y, z], [x - sx * len, y, z])
        pts.push([x, y, z], [x, y + sy * len, z])
        pts.push([x, y, z], [x, y, z - sz * len])
      }
    }
  }
  return pts
}

export function UnitObject({ unitId }: { unitId: string }) {
  const unit = useUnit(unitId)
  const grp = useRef<THREE.Group>(null)

  const selected = useAppStore((s) => s.sel.units.includes(unitId))
  const hovered = useAppStore((s) => s.hoverUnit === unitId)
  const colliding = useAppStore((s) => s.drag?.colliding.includes(unitId) ?? false)
  const ghost = useAppStore((s) => s.view.ghost)
  const quality = useAppStore((s) => s.view.quality)
  const open = useAppStore((s) => s.view.open)
  const explode = useAppStore((s) => s.view.explode)
  const theme = useAppStore((s) => s.view.theme)

  const frame = unit?.frame
  const cells = unit?.cells
  const materials = unit?.materials

  const geo = useMemo(
    () => (unit ? getUnitGeometry(unit) : null),
    // геометрия зависит только от содержимого юнита, не от его положения
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frame, cells, materials],
  )

  /** направление разлёта каждой детали от центра юнита */
  const dirs = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    if (!geo) return map
    const cy = geo.outer.y / 2
    for (const p of geo.parts) {
      const v = new THREE.Vector3(p.center.x, p.center.y - cy, p.center.z)
      if (v.lengthSq() < 1e-6) v.set(0, 1, 0)
      map.set(p.id, v.normalize())
    }
    return map
  }, [geo])

  const outline = useMemo(() => {
    if (!geo) return null
    const pad = mm(OUTLINE_PAD)
    const hw = mm(geo.outer.x) / 2 + pad
    const hd = mm(geo.outer.z) / 2 + pad
    const y1 = mm(geo.outer.y) + pad
    const len = Math.min(TICK, Math.min(hw, hd, y1 / 2) * 0.5)
    return {
      box: boxSegments(hw, -pad, y1, hd),
      ticks: cornerTicks(hw, -pad, y1, hd, len),
      top: y1,
    }
  }, [geo])

  const colors = useMemo(
    () => ({
      accent: themeColor('--accent', '#e8b04b'),
      dim: themeColor('--text-dim', '#9aa1ab'),
      danger: themeColor('--danger', '#ff5f56'),
      text: themeColor('--text', '#e8eaed'),
      panel: themeColor('--bg-elevated', '#1c2025'),
      border: themeColor('--border-strong', '#363b42'),
    }),
    [theme],
  )

  // Позиция/поворот/высота: во время драга — из live, иначе — из проекта. Без ререндера.
  // Высота установки — это Y внешней группы, поэтому вместе с юнитом едут
  // и рамка выделения, и подпись: они его дети.
  useFrame(() => {
    const g = grp.current
    if (!g || !unit) return
    const live = appState().drag?.live[unitId]
    const pos = live ? live.pos : unit.pos
    const rotY = live ? live.rotY : unit.rotY
    const elev = live ? live.elevation : elevationOf(unit)
    g.position.set(mm(pos.x), mm(elev), mm(pos.z))
    g.rotation.y = rotY
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const st = useAppStore.getState()
    if (e.ctrlKey || e.metaKey) st.toggleSelect(unitId)
    else st.select([unitId])
  }

  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    useAppStore.getState().select([unitId])
    requestFocus()
  }

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
    useAppStore.getState().setHoverUnit(unitId)
  }

  const onOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = ''
    useAppStore.getState().setHoverUnit(null)
  }

  if (!unit || !geo || !outline) return null

  const showFrame = selected || hovered
  const frameColor = colliding ? colors.danger : selected ? colors.accent : colors.dim

  return (
    <group
      ref={grp}
      userData={{ unitId }}
      position={[mm(unit.pos.x), mm(elevationOf(unit)), mm(unit.pos.z)]}
      rotation={[0, unit.rotY, 0]}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerOver={onOver}
      onPointerOut={onOut}
    >
      {geo.parts.map((p) => (
        <PartMesh
          key={p.id}
          part={p}
          unit={unit}
          quality={quality}
          ghost={ghost}
          open={open}
          explode={explode}
          explodeDir={dirs.get(p.id) ?? UP}
        />
      ))}

      {/* всё служебное — одной веткой, её целиком гасит экспортёр GLB */}
      <group userData={SERVICE}>
        <CellPicker unit={unit} />

        {showFrame && (
          <>
            <Line
              points={outline.box}
              segments
              color={frameColor}
              lineWidth={selected ? 1.6 : 1.1}
              transparent
              opacity={selected ? 0.9 : 0.5}
              dashed={unit.locked}
              dashSize={0.05}
              gapSize={0.035}
              depthWrite={false}
              toneMapped={false}
            />
            <Line
              points={outline.ticks}
              segments
              color={frameColor}
              lineWidth={selected ? 3.2 : 2}
              transparent
              opacity={selected ? 1 : 0.6}
              depthWrite={false}
              toneMapped={false}
            />
            {/* Без distanceFactor: подпись — элемент интерфейса, её размер не должен
                зависеть от расстояния до камеры, иначе вблизи она перекрывает пол-экрана */}
            <Html
              position={[0, outline.top + 0.09, 0]}
              center
              occlude={false}
              zIndexRange={[80, 0]}
              pointerEvents="none"
              wrapperClass="pointer-events-none"
            >
              <div
                style={{
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: colors.panel,
                  border: `1px solid ${selected ? colors.accent : colors.border}`,
                  color: colors.text,
                  font: '500 11px/1.25 var(--font-sans, sans-serif)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  opacity: selected ? 1 : 0.75,
                  boxShadow: '0 2px 8px rgb(0 0 0 / 0.28)',
                }}
              >
                {unit.name}
              </div>
            </Html>
          </>
        )}
      </group>
    </group>
  )
}
