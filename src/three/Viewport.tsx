/**
 * Хост 3D-сцены: canvas, фон, слои и оверлеи.
 *
 * Фон — CSS-градиент под прозрачным канвасом (alpha: true), а не three-скайбокс:
 * так он бесплатный, живёт в теме приложения и не ломает тонмаппинг.
 *
 * Всё, что рисуется, лежит в отдельных слоях (их пишут другие модули):
 * RoomShell (пол/стены/сетка), UnitsLayer (стеллажи + пикинг),
 * DragLayer (драг и магниты), DimensionsLayer (размеры).
 * В sceneRegistry.content уходит ТОЛЬКО группа со стеллажами — это то,
 * что экспортируется в GLB без пола и хелперов.
 */

import { Suspense, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, type RootState } from '@react-three/fiber'
import { GizmoHelper, GizmoViewcube } from '@react-three/drei'

import { t } from '@/i18n'
import { useAppStore } from '@/store/useStore'
import { sceneRegistry } from '@/three/registry'
import { CameraRig } from '@/three/Camera'
import { Lighting } from '@/three/Lighting'
import { Effects } from '@/three/Effects'
import { UnitsLayer } from '@/three/UnitsLayer'
import { DragLayer } from '@/three/DragLayer'
import { RoomShell } from '@/three/RoomShell'
import { DimensionsLayer } from '@/three/DimensionsLayer'

const GIZMO_MARGIN: [number, number] = [64, 64]
/** Порядок граней кубика — drei: +X, −X, +Y, −Y, +Z, −Z */
const VIEWCUBE_FACES = [
  t('Право'),
  t('Лево'),
  t('Верх'),
  t('Низ'),
  t('Перёд'),
  t('Зад'),
]

/**
 * Тип теней задаём объектом, а не строкой-пресетом.
 *
 * R3F по умолчанию (shadows / shadows='soft') ставит PCFSoftShadowMap, а three
 * 0.185 этот тип уже не поддерживает: WebGLShadowMap молча подменяет его на
 * PCFShadowMap и печатает предупреждение в консоль. Явный PCFShadowMap убирает
 * предупреждение и не меняет картинку.
 *
 * Мягкость краёв даёт не шадоу-мапа, а light.shadow.radius (его выставляет
 * Lighting) вместе с ContactShadows и N8AO — как в мебельных рендерах.
 *
 * Ссылка стабильная: R3F переприменяет настройки рендерера на каждый рендер
 * Canvas, и новый литерал каждый раз дёргал бы shadowMap.needsUpdate.
 */
const SHADOWS = { type: THREE.PCFShadowMap, enabled: true }

/**
 * Кубик ориентации — только в 3D: в ортовидах вращение камеры заблокировано.
 *
 * ПОРЯДОК КАДРА. GizmoHelper внутри использует drei <Hud>, и тот берёт рендер
 * на себя через useFrame(priority). R3F выключает свой авто-рендер, как только
 * есть хоть одна подписка с priority > 0, и сортирует подписки по возрастанию:
 * кто позже — тот рисует поверх.
 *   • quality === 'low' — композера нет, основную сцену обязан отрисовать сам
 *     Hud, а он делает это ТОЛЬКО при renderPriority === 1.
 *   • quality >= medium — сцену рисует EffectComposer (priority 1). Кубику
 *     нужен приоритет ВЫШЕ, иначе композер затрёт его своим кадром
 *     (при равном приоритете он идёт последним) и кубика просто не видно.
 */
function ViewCube() {
  const mode = useAppStore((s) => s.view.mode)
  const quality = useAppStore((s) => s.view.quality)
  if (mode !== '3d') return null
  return (
    <GizmoHelper
      alignment="bottom-right"
      margin={GIZMO_MARGIN}
      renderPriority={quality === 'low' ? 1 : 2}
    >
      <GizmoViewcube
        faces={VIEWCUBE_FACES}
        color="#1c2025"
        hoverColor="#e8b04b"
        textColor="#9aa1ab"
        strokeColor="#363b42"
        opacity={0.92}
      />
    </GizmoHelper>
  )
}

/** Ненавязчивая подсказка внизу кадра */
function SceneHint() {
  const dragging = useAppStore((s) => s.drag !== null)
  const nothingSelected = useAppStore((s) => s.sel.units.length === 0)

  const text = dragging
    ? t('Alt — временно отключить привязки')
    : nothingSelected
      ? t('Кликните по стеллажу, чтобы выбрать')
      : ''

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
      <div
        className="px-2 text-[11px] transition-opacity duration-300"
        style={{ color: 'var(--text-faint)', opacity: text ? 1 : 0, letterSpacing: '0.01em' }}
      >
        {text || ' '}
      </div>
    </div>
  )
}

export function Viewport() {
  const quality = useAppStore((s) => s.view.quality)

  // качество на момент создания контекста: antialias нельзя менять на живом
  // рендерере, а пересоздавать gl-объект — значит терять всю сцену
  const initialQuality = useRef(useAppStore.getState().view.quality).current

  const dpr = useMemo<[number, number]>(
    () => (quality === 'ultra' ? [1, 2] : quality === 'high' ? [1, 1.75] : [1, 1.25]),
    [quality],
  )

  // стабильная ссылка: иначе R3F переприменял бы toneMapping поверх композера
  const glProps = useMemo(
    () => ({
      antialias: initialQuality !== 'low',
      alpha: true,
      powerPreference: 'high-performance' as const,
      // нужен для «скриншота» — иначе буфер очищается до чтения
      preserveDrawingBuffer: true,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.05,
    }),
    [initialQuality],
  )

  const onCreated = useCallback((state: RootState) => {
    sceneRegistry.scene = state.scene
    sceneRegistry.camera = state.camera
    sceneRegistry.gl = state.gl
    state.gl.outputColorSpace = THREE.SRGBColorSpace
  }, [])

  const setContent = useCallback((g: THREE.Group | null) => {
    sceneRegistry.content = g
  }, [])

  return (
    <div
      className="relative h-full min-h-0 w-full min-w-0 flex-1"
      style={{ background: 'linear-gradient(var(--scene-top), var(--scene-bottom))' }}
    >
      <Canvas
        shadows={SHADOWS}
        dpr={dpr}
        gl={glProps}
        frameloop="always"
        onCreated={onCreated}
      >
        <CameraRig />
        <Lighting />

        <Suspense fallback={null}>
          <RoomShell />
        </Suspense>

        {/* только эта группа уходит в экспорт GLB */}
        <group ref={setContent}>
          <Suspense fallback={null}>
            <UnitsLayer />
          </Suspense>
        </group>

        <Suspense fallback={null}>
          <DragLayer />
        </Suspense>

        <Suspense fallback={null}>
          <DimensionsLayer />
        </Suspense>

        <ViewCube />
        <Effects />
      </Canvas>

      <SceneHint />
    </div>
  )
}
