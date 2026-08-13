/**
 * Скриншот вьюпорта.
 *
 * Снимок обязан совпадать с тем, что человек видит на экране, поэтому кадр
 * гоняется ЧЕРЕЗ КОМПОЗЕР пост-обработки (N8AO → Bloom → ACES → виньетка → SMAA),
 * если он жив. Прямой gl.render(scene, camera) остаётся запасным путём для
 * качества «Низкое», где композера нет вовсе.
 *
 * Рендерим в увеличенный буфер (по умолчанию 2× — ретина-качество для
 * презентации) и ОБЯЗАТЕЛЬНО возвращаем всё как было: размер рендерера и
 * композера, pixelRatio, матрицы камеры, фон и alpha очистки.
 */

import * as THREE from 'three'

import { t } from '@/i18n'
import { sceneRegistry, requestFrame } from '@/three/registry'
import { appState } from '@/store/useStore'
import { downloadFile } from '@/export/project'

export interface ScreenshotOptions {
  /** ширина итогового PNG, px (по умолчанию — из scale) */
  width?: number
  /** высота итогового PNG, px */
  height?: number
  /**
   * прозрачный фон вместо неба сцены (только для PNG).
   * На качестве выше «Низкого» кадр идёт через композер, и последний проход
   * может вернуть непрозрачный фон — это ограничение пост-обработки.
   */
  transparent?: boolean
  /** множитель к текущему размеру канваса, если width/height не заданы */
  scale?: number
  /** имя файла без расширения */
  name?: string
  /** формат картинки; JPEG заметно легче — им иллюстрируем печатную спецификацию */
  type?: 'image/png' | 'image/jpeg'
  /** качество JPEG, 0…1 */
  quality?: number
}

/** Ошибка с текстом для пользователя */
class ShotBlocked extends Error {}

/**
 * Композер глазами скриншота.
 *
 * Третий аргумент setSize — updateStyle: postprocessing прокидывает его прямо
 * в renderer.setSize, и без явного `false` поменялся бы CSS-размер канваса,
 * то есть дёрнулась бы вёрстка. Реестр объявляет функцию с двумя параметрами —
 * это совместимо: функция меньшей арности подходит под тип с большей.
 */
type ComposerLike = {
  render: () => void
  setSize: (w: number, h: number, updateStyle?: boolean) => void
}

/**
 * Тонмаппинг на время прямого снимка.
 *
 * Пока жив композер (@react-three/postprocessing), он держит
 * gl.toneMapping = NoToneMapping и делает ACES отдельным проходом. В путь
 * «через композер» лезть не надо — он сам всё применит. А вот если мы всё-таки
 * рендерим напрямую при живом композере (страховка), без подмены снимок вышел
 * бы «выжженным».
 */
function forceToneMapping(gl: THREE.WebGLRenderer): () => void {
  const prev = gl.toneMapping
  if (prev !== THREE.NoToneMapping) return () => {}
  gl.toneMapping = THREE.ACESFilmicToneMapping
  return () => {
    gl.toneMapping = prev
  }
}

const safeName = (s: string): string =>
  s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'standes'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** «2026-08-13_14-07» — сортируемая метка времени в имени файла */
function stamp(d = new Date()): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `_${pad2(d.getHours())}-${pad2(d.getMinutes())}`
  )
}

function isPerspective(c: THREE.Camera): c is THREE.PerspectiveCamera {
  return (c as THREE.PerspectiveCamera).isPerspectiveCamera === true
}

function isOrthographic(c: THREE.Camera): c is THREE.OrthographicCamera {
  return (c as THREE.OrthographicCamera).isOrthographicCamera === true
}

/** dataURL -> Blob без промежуточного base64-парсинга руками */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

const clamp01 = (v: number): number => (v < 0.05 ? 0.05 : v > 1 ? 1 : v)

export interface Shot {
  dataUrl: string
  width: number
  height: number
}

/**
 * Синхронно снимает кадр и отдаёт dataURL.
 *
 * Синхронность важна: между нажатием кнопки и window.open (печатная
 * спецификация) не должно быть лишних await, иначе браузер сочтёт всплывающее
 * окно непрошеным. Бросает ShotBlocked, если снять нечего.
 */
function takeShot(opts: ScreenshotOptions): Shot {
  const { gl, scene, camera } = sceneRegistry
  if (!gl || !scene || !camera) {
    throw new ShotBlocked(t('Сцена ещё не готова — снимок сделать нечем'))
  }
  const composer: ComposerLike | null = sceneRegistry.composer
  const canvas = gl.domElement

  // ── сохраняем состояние ──────────────────────────────────────────────────
  const prevRatio = gl.getPixelRatio()
  // getSize отдаёт CSS-размер (без pixelRatio) — ровно то, что нужно вернуть.
  // Нули (рендерер ещё ни разу не размерялся) подменяем на размер канваса,
  // иначе восстановление схлопнуло бы вьюпорт в точку.
  const prevSize = gl.getSize(new THREE.Vector2())
  if (prevSize.x < 1 || prevSize.y < 1) {
    prevSize.set(
      Math.max(1, canvas.clientWidth || canvas.width),
      Math.max(1, canvas.clientHeight || canvas.height),
    )
  }
  const prevBackground = scene.background
  const prevAlpha = gl.getClearAlpha()

  const persp = isPerspective(camera) ? camera : null
  const ortho = isOrthographic(camera) ? camera : null
  const prevAspect = persp ? persp.aspect : 0
  const prevRect = ortho
    ? { l: ortho.left, r: ortho.right, t: ortho.top, b: ortho.bottom }
    : null

  // ── размер снимка ────────────────────────────────────────────────────────
  const baseW = Math.max(1, Math.round(prevSize.x || canvas.clientWidth || canvas.width))
  const baseH = Math.max(1, Math.round(prevSize.y || canvas.clientHeight || canvas.height))
  const scale = Math.max(0.25, opts.scale ?? 2)

  // ограничение GPU: буфер больше maxTextureSize просто не создастся
  const limit = Math.max(1024, gl.capabilities.maxTextureSize || 4096)
  let outW = Math.max(1, Math.round(opts.width ?? baseW * scale))
  let outH = Math.max(1, Math.round(opts.height ?? baseH * scale))
  const over = Math.max(outW / limit, outH / limit)
  if (over > 1) {
    outW = Math.max(1, Math.floor(outW / over))
    outH = Math.max(1, Math.floor(outH / over))
  }

  // прямой рендер требует ручного ACES, рендер через композер — нет
  const restoreTone = composer ? () => {} : forceToneMapping(gl)

  let dataUrl = ''
  try {
    // updateStyle=false — CSS-размер канваса не трогаем, вёрстка не дёргается
    gl.setPixelRatio(1)
    gl.setSize(outW, outH, false)
    composer?.setSize(outW, outH, false)

    const aspect = outW / outH
    if (persp) {
      persp.aspect = aspect
      persp.updateProjectionMatrix()
    } else if (ortho) {
      // сохраняем вертикальный охват, растягиваем горизонталь вокруг центра
      const cx = (ortho.left + ortho.right) / 2
      const halfH = (ortho.top - ortho.bottom) / 2
      const halfW = halfH * aspect
      ortho.left = cx - halfW
      ortho.right = cx + halfW
      ortho.updateProjectionMatrix()
    }

    if (opts.transparent) {
      scene.background = null
      gl.setClearAlpha(0)
    }

    if (composer) composer.render()
    else gl.render(scene, camera)

    // читаем сразу после render — буфер ещё не сброшен, preserveDrawingBuffer не нужен
    dataUrl =
      opts.type === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', clamp01(opts.quality ?? 0.92))
        : canvas.toDataURL('image/png')
  } finally {
    // ── восстанавливаем состояние ──────────────────────────────────────────
    restoreTone()
    scene.background = prevBackground
    gl.setClearAlpha(prevAlpha)
    // сначала pixelRatio (внутри он пересчитывает буфер по текущему размеру),
    // затем сам размер — иначе буфер остался бы от снимка
    gl.setPixelRatio(prevRatio)
    gl.setSize(prevSize.x, prevSize.y, false)
    composer?.setSize(prevSize.x, prevSize.y, false)

    if (persp) {
      persp.aspect = prevAspect
      persp.updateProjectionMatrix()
    } else if (ortho && prevRect) {
      ortho.left = prevRect.l
      ortho.right = prevRect.r
      ortho.top = prevRect.t
      ortho.bottom = prevRect.b
      ortho.updateProjectionMatrix()
    }

    // сразу же вернуть на экран нормальный кадр — иначе до следующего кадра
    // R3F в окне висела бы растянутая картинка снимка
    if (composer) composer.render()
    else gl.render(scene, camera)
    // на случай frameloop='demand' — попросим R3F перерисовать свой кадр
    requestFrame()
  }

  if (!dataUrl || dataUrl.length < 32) {
    throw new ShotBlocked(t('Браузер не отдал изображение канваса'))
  }
  return { dataUrl, width: outW, height: outH }
}

/**
 * Снимает кадр и скачивает файл.
 * Никогда не реджектится: любая ошибка превращается в toast.
 */
export async function captureScreenshot(opts: ScreenshotOptions = {}): Promise<void> {
  try {
    const shot = takeShot(opts)
    const mime = opts.type ?? 'image/png'
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
    const file = `${safeName(opts.name ?? appState().project.name)}_${stamp()}.${ext}`
    downloadFile(file, await dataUrlToBlob(shot.dataUrl), mime)
    appState().toast(t('Снимок сохранён: {w}×{h}', { w: shot.width, h: shot.height }))
  } catch (e) {
    const msg = e instanceof ShotBlocked ? e.message : t('Не удалось снять скриншот')
    appState().toast(msg, 'error')
  }
}

/**
 * Тот же кадр, но без скачивания — для вставки в печатную спецификацию.
 * Возвращает dataURL или null, если снять не удалось.
 */
export function captureDataUrl(opts: Omit<ScreenshotOptions, 'name'> = {}): string | null {
  try {
    return takeShot(opts).dataUrl
  } catch {
    return null
  }
}
