import type * as THREE from 'three'

/**
 * Мостик между React-деревом сцены и «внешним миром» (экспорт GLB, скриншот, фокус камеры).
 * Viewport заполняет это при монтировании, остальные читают.
 */
export interface SceneRegistry {
  scene: THREE.Scene | null
  camera: THREE.Camera | null
  gl: THREE.WebGLRenderer | null
  /** корневой Group со всеми стеллажами — то, что уходит в GLB (без пола, сетки и хелперов) */
  content: THREE.Group | null
  /** OrbitControls / CameraControls — для программного фокуса */
  controls: { target?: THREE.Vector3; update?: () => void } | null
  /**
   * Композер пост-обработки, пока он жив (quality > 'low'). Тип нарочно
   * структурный и минимальный: реестру незачем знать про 'postprocessing',
   * а скриншоту нужны ровно эти две операции, чтобы снимок совпал с экраном.
   */
  composer: { render: () => void; setSize: (w: number, h: number) => void } | null
}

export const sceneRegistry: SceneRegistry = {
  scene: null,
  camera: null,
  gl: null,
  content: null,
  controls: null,
  composer: null,
}

/** Событие «сфокусировать камеру на выборе» — шлётся из горячих клавиш и UI */
export const FOCUS_EVENT = 'standes:focus'

export function requestFocus() {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT))
}

/** Событие «отрендерить кадр» для случая frameloop='demand' */
export const INVALIDATE_EVENT = 'standes:invalidate'

export function requestFrame() {
  window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT))
}
