/**
 * Экспорт сцены в .glb (glTF binary).
 *
 * Выгружаем ТОЛЬКО sceneRegistry.content — группу со стеллажами.
 * Пол, сетка, хелперы и подсветка выбора в модель заказчика попадать не должны.
 */

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type * as THREE from 'three'

import { t } from '@/i18n'
import { sceneRegistry } from '@/three/registry'
import { appState } from '@/store/useStore'
import { downloadFile } from '@/export/project'

/** Ошибка с текстом, который не стыдно показать пользователю */
class ExportBlocked extends Error {}

const OPTIONS: GLTFExporterOptions = {
  binary: true,
  onlyVisible: true,
  maxTextureSize: 2048,
  embedImages: true,
}

/** Имя файла без запрещённых символов */
const safeName = (s: string): string =>
  s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'standes'

/**
 * Временно гасит служебные объекты (обводки выбора, подписи, пикер ячеек).
 * Помечаются как `object.userData.noExport = true` при создании — см. UnitObject.
 * Возвращает список погашенных — чтобы восстановить.
 */
function hideServiceObjects(root: THREE.Object3D): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.visible && (o.userData as Record<string, unknown>).noExport === true) {
      o.visible = false
      hidden.push(o)
    }
  })
  return hidden
}

/**
 * Сколько видимых мешей реально уедет в файл.
 * Считать children корневой группы нельзя: там всегда лежит ровно один
 * контейнер-слой (UnitsLayer), даже когда стеллажей ноль.
 */
function countExportable(root: THREE.Object3D): number {
  // Ветку целиком отсекаем по visible — так же поступает GLTFExporter
  // с onlyVisible: true, поэтому traverse здесь не подходит.
  if (!root.visible) return 0
  let n = (root as THREE.Mesh).isMesh && (root as THREE.Mesh).geometry ? 1 : 0
  for (const child of root.children) n += countExportable(child)
  return n
}

/**
 * Собирает .glb и отдаёт файл пользователю.
 * Никогда не реджектится: любая ошибка превращается в toast.
 */
export async function exportGltf(name?: string): Promise<void> {
  let restore: THREE.Object3D[] = []
  try {
    const content = sceneRegistry.content
    if (!content) {
      throw new ExportBlocked(t('Сцена ещё не готова — нечего выгружать'))
    }
    restore = hideServiceObjects(content)

    if (countExportable(content) === 0) {
      throw new ExportBlocked(t('В сцене нет ни одного стеллажа'))
    }

    const exporter = new GLTFExporter()
    const result = await exporter.parseAsync(content, OPTIONS)
    if (!(result instanceof ArrayBuffer)) {
      // binary: true обязан вернуть ArrayBuffer; если нет — что-то поехало в three
      throw new Error('GLTFExporter вернул не бинарный результат')
    }

    const file = `${safeName(name ?? appState().project.name)}.glb`
    downloadFile(file, new Blob([result], { type: 'model/gltf-binary' }))
    appState().toast(t('Модель выгружена: {file}', { file }))
  } catch (e) {
    const msg =
      e instanceof ExportBlocked ? e.message : t('Не удалось экспортировать модель')
    appState().toast(msg, 'error')
  } finally {
    for (const o of restore) o.visible = true
  }
}
