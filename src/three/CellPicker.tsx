/**
 * Кликабельные плоскости ячеек выбранного юнита.
 *
 * Смысл: пользователь тыкает прямо в проём стеллажа и меняет его наполнение,
 * не заходя в инспектор. Плоскости невидимы (opacity 0), но ловят raycast.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'

import { cellRects } from '@/domain/frame'
import type { CellKey, ShelfUnit } from '@/domain/types'
import { mm } from '@/domain/types'
import { useAppStore } from '@/store/useStore'
import { themeColor } from '@/three/PartMesh'

/** Вынос плоскости перед фасадом, мм */
const FRONT_OFFSET = 12
/** Подсветка ячейки */
const HL_OPACITY = 0.16
/** Еле заметная заливка всех ячеек, когда в руках кисть */
const BRUSH_HINT = 0.05

export function CellPicker({ unit }: { unit: ShelfUnit }) {
  const active = useAppStore((s) => s.sel.units.includes(unit.id))
  const selKey = useAppStore((s) => (s.sel.cell?.unitId === unit.id ? s.sel.cell.key : null))
  const hoverKey = useAppStore((s) => (s.hoverCell?.unitId === unit.id ? s.hoverCell.key : null))
  const hasBrush = useAppStore((s) => s.ui.brush !== null)
  const theme = useAppStore((s) => s.view.theme)

  const rects = useMemo(() => cellRects(unit).rects, [unit])
  const z = mm(unit.frame.depth / 2 + FRONT_OFFSET)

  const colors = useMemo(
    () => ({
      accent: themeColor('--accent', '#e8b04b'),
      magnet: themeColor('--magnet', '#4ea8ff'),
    }),
    [theme],
  )

  const onOver = (key: CellKey) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = hasBrush ? 'copy' : 'pointer'
    useAppStore.getState().setHoverCell({ unitId: unit.id, key })
  }

  const onOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = ''
    useAppStore.getState().setHoverCell(null)
  }

  const onClick = (key: CellKey) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const st = useAppStore.getState()
    if (st.ui.brush) st.setCellFill(unit.id, key, st.ui.brush)
    else st.selectCell(unit.id, key)
  }

  if (!active) return null

  return (
    <group>
      {rects.map((r) => {
        const w = mm(r.x1 - r.x0)
        const h = mm(r.y1 - r.y0)
        const cx = mm((r.x0 + r.x1) / 2)
        const cy = mm((r.y0 + r.y1) / 2)
        const selected = selKey === r.key
        const hovered = hoverKey === r.key
        const opacity = selected || hovered ? HL_OPACITY : hasBrush ? BRUSH_HINT : 0
        const color = selected ? colors.accent : hovered ? colors.magnet : colors.accent

        return (
          <group key={r.key} position={[cx, cy, z]}>
            <mesh
              onPointerOver={onOver(r.key)}
              onPointerOut={onOut}
              onClick={onClick(r.key)}
              renderOrder={20}
            >
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {selected && (
              <Line
                points={[
                  [-w / 2, -h / 2, 0.001],
                  [w / 2, -h / 2, 0.001],
                  [w / 2, h / 2, 0.001],
                  [-w / 2, h / 2, 0.001],
                  [-w / 2, -h / 2, 0.001],
                ]}
                color={colors.accent}
                lineWidth={1.4}
                depthWrite={false}
                toneMapped={false}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}
