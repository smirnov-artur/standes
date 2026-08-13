/**
 * Пост-обработка сцены.
 *
 * Порядок проходов: AO → Bloom → ToneMapping → Vignette → SMAA.
 *
 * ВАЖНО про тонмаппинг. @react-three/postprocessing принудительно ставит
 * gl.toneMapping = NoToneMapping на всё время жизни композера (three не умеет
 * тонмаппить при рендере в render target). Поэтому ACES здесь добавлен
 * ЭФФЕКТОМ — иначе на medium+ картинка была бы «выжжена» и не совпадала бы
 * с режимом low, где работает тонмаппинг рендерера. Это не дублирование.
 *
 * AO — N8AO (пакет n8ao есть в node_modules как зависимость обёртки):
 * радиус в МЕТРАХ мировых координат, поэтому даёт честное затемнение
 * в стыках деталей, а не серую вуаль по всему кадру, как экранный SSAO.
 *
 * Экземпляр композера кладём в sceneRegistry: без него экспорт PNG рисовал бы
 * мимо пост-обработки и снимок не совпадал бы с картинкой на экране.
 */

import { useCallback } from 'react'
import {
  Bloom,
  EffectComposer,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import {
  ToneMappingMode,
  VignetteTechnique,
  type EffectComposer as EffectComposerImpl,
} from 'postprocessing'

import { sceneRegistry } from '@/three/registry'
import { useAppStore } from '@/store/useStore'

export function Effects() {
  const quality = useAppStore((s) => s.view.quality)

  /**
   * Ref-колбэк, а не ref-объект: обёртка отдаёт композер через
   * useImperativeHandle и пересоздаёт его при смене камеры/рендерера,
   * а колбэк ловит и создание, и уборку (React зовёт его с null).
   */
  const keepComposer = useCallback((c: EffectComposerImpl | null) => {
    sceneRegistry.composer = c ?? null
  }, [])

  // на low композер полностью выключен — тонмаппинг остаётся на рендерере
  if (quality === 'low') return null

  const ultra = quality === 'ultra'
  // AO и bloom — только на тяжёлых пресетах
  const rich = quality === 'high' || ultra

  return (
    <EffectComposer ref={keepComposer} multisampling={ultra ? 4 : 0} enableNormalPass={false}>
      {rich ? (
        <N8AO
          // радиус в метрах: ~28 см — ловит стыки полок и боковин,
          // но не затемняет крупные плоскости
          aoRadius={0.28}
          distanceFalloff={0.6}
          intensity={2.2}
          quality={ultra ? 'high' : 'medium'}
          halfRes={!ultra}
          depthAwareUpsampling
          screenSpaceRadius={false}
          color="#0a0c10"
        />
      ) : (
        <></>
      )}

      {rich ? (
        <Bloom
          intensity={0.22}
          luminanceThreshold={0.92}
          luminanceSmoothing={0.4}
          mipmapBlur
          levels={7}
        />
      ) : (
        <></>
      )}

      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* technique DEFAULT === устаревшее eskil: false */}
      <Vignette technique={VignetteTechnique.DEFAULT} offset={0.32} darkness={0.42} />
      <SMAA />
    </EffectComposer>
  )
}
