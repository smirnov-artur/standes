/**
 * Слой взаимодействия: невидимые хит-боксы юнитов, плоскость пола для
 * попадания «в пустоту» и вся визуализация магнитов.
 *
 * Хит-боксы живут на HIT_LAYER — камера их не рендерит, событийный рейкастер
 * R3F их не видит, а собственный рейкастер из useUnitDrag видит только их.
 * Трансформы боксов обновляются мутацией в useFrame (учитывая drag.live),
 * поэтому перетаскивание не вызывает лишних ре-рендеров React.
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { elevationOf, outerSize } from '@/domain/frame'
import { MM } from '@/domain/types'
import { appState, useUnits } from '@/store/useStore'
import { SnapVisuals } from '@/three/SnapVisuals'
import { HIT_LAYER, useUnitDrag } from '@/three/useUnitDrag'

export function DragLayer() {
  const { hitRef } = useUnitDrag()
  const units = useUnits()
  const visible = useMemo(() => units.filter((u) => !u.hidden), [units])

  // куб 1×1×1 с основанием в y=0 — совпадает с origin юнита (центр пятна на полу)
  const boxGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const planeGeom = useMemo(() => new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), [])
  const hitMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      boxGeom.dispose()
      planeGeom.dispose()
      hitMat.dispose()
    },
    [boxGeom, planeGeom, hitMat],
  )

  /** невидимое ≠ нерейкастимое: прячем боксы слоем, а не visible=false */
  const toHitLayer = useCallback((o: THREE.Object3D | null) => {
    if (o) o.layers.set(HIT_LAYER)
  }, [])

  useFrame(() => {
    const g = hitRef.current
    if (!g) return
    const st = appState()
    for (const child of g.children) {
      const id: unknown = child.userData['unitId']
      if (typeof id !== 'string') continue
      const u = st.project.units.find((x) => x.id === id)
      if (!u) continue
      const live = st.drag?.live[id]
      const pos = live ? live.pos : u.pos
      const rotY = live ? live.rotY : u.rotY
      // Штабель: бокс обязан стоять на своей высоте, иначе поднятый юнит
      // не поймать курсором — луч уйдёт в пустую коробку у пола.
      // Геометрия боксa основанием в y=0, поэтому position.y = elevation
      // (центр по Y при этом сам оказывается на elevation + height/2).
      const elev = live ? live.elevation : elevationOf(u)
      const s = outerSize(u.frame)
      child.position.set(pos.x * MM, elev * MM, pos.z * MM)
      child.rotation.y = rotY
      child.scale.set(s.x * MM, s.y * MM, s.z * MM)
    }
  })

  return (
    <>
      <group ref={hitRef}>
        {/* пол для клика «в пустоту» */}
        <mesh
          ref={toHitLayer}
          geometry={planeGeom}
          material={hitMat}
          userData={{ background: true }}
          frustumCulled={false}
        />
        {visible.map((u) => (
          <mesh
            key={u.id}
            ref={toHitLayer}
            geometry={boxGeom}
            material={hitMat}
            userData={{ unitId: u.id }}
            frustumCulled={false}
          />
        ))}
      </group>

      <SnapVisuals />
    </>
  )
}
