/**
 * Слой стеллажей: только список видимых id и по объекту на каждый.
 *
 * Подписка узкая — массив id, сравнение shallow. Изменение позиции, ячеек или
 * материалов юнита сюда не долетает: перерисовывается только сам UnitObject.
 */

import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import { useShallow } from 'zustand/react/shallow'

import { useAppStore } from '@/store/useStore'
import { UnitObject } from '@/three/UnitObject'
import { sceneRegistry } from '@/three/registry'

export function UnitsLayer() {
  const ids = useAppStore(
    useShallow((s) => s.project.units.filter((u) => !u.hidden).map((u) => u.id)),
  )
  const root = useRef<THREE.Group>(null)

  // Если Viewport не назначил content сам — регистрируем свою группу (нужна экспорту GLB).
  // Эффекты родителя выполняются позже, поэтому его выбор всегда перекроет наш.
  useEffect(() => {
    const g = root.current
    if (!g || sceneRegistry.content) return
    sceneRegistry.content = g
    return () => {
      if (sceneRegistry.content === g) sceneRegistry.content = null
    }
  }, [])

  return (
    <group ref={root} name="units">
      {ids.map((id) => (
        <UnitObject key={id} unitId={id} />
      ))}
    </group>
  )
}
