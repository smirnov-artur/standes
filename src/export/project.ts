import type { Project } from '@/domain/types'
import { makeProject } from '@/domain/defaults'
import { t } from '@/i18n'

const LS_KEY = 'standes:project:v1'
const LS_AUTOSAVE = 'standes:autosave:v1'

/** Отдаёт файл пользователю. В песочнице/артефакте download может быть заблокирован — не паникуем. */
export function downloadFile(name: string, data: string | Blob, mime = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${mime};charset=utf-8` }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const safeName = (s: string) =>
  s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'standes'

export function exportProjectJson(project: Project) {
  const payload = JSON.stringify({ ...project, updatedAt: Date.now() }, null, 2)
  downloadFile(`${safeName(project.name)}.standes.json`, payload)
}

/** Валидирует и «чинит» загруженный проект — файл мог быть от старой версии или битый. */
export function parseProject(raw: string): Project {
  const data = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error(t('Файл не похож на проект STANDES'))
  const base = makeProject()
  const p: Project = {
    version: 1,
    id: typeof data.id === 'string' ? data.id : base.id,
    name: typeof data.name === 'string' ? data.name : t('Импортированный проект'),
    units: Array.isArray(data.units) ? data.units : [],
    room: { ...base.room, ...(data.room ?? {}) },
    createdAt: Number(data.createdAt) || Date.now(),
    updatedAt: Date.now(),
  }
  if (!p.units.length) throw new Error(t('В проекте нет ни одного стеллажа'))
  for (const u of p.units) {
    if (!u.id || !u.frame || !Array.isArray(u.frame.cols) || !Array.isArray(u.frame.rows)) {
      throw new Error(t('Повреждённые данные стеллажа'))
    }
    u.cells ??= {}
    u.pos ??= { x: 0, z: 0 }
    u.rotY ??= 0
    u.locked ??= false
    u.hidden ??= false
    u.materials = { ...base.units[0].materials, ...(u.materials ?? {}) }
  }
  return p
}

export function importProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error(t('Файл не выбран')))
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(parseProject(String(reader.result)))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(t('Не удалось прочитать файл')))
        }
      }
      reader.onerror = () => reject(new Error(t('Ошибка чтения файла')))
      reader.readAsText(file)
    }
    input.click()
  })
}

// ── Автосохранение ──────────────────────────────────────────────────────────

export function saveLocal(project: Project, key = LS_AUTOSAVE) {
  try {
    localStorage.setItem(key, JSON.stringify(project))
  } catch {
    /* переполнение квоты — молча пропускаем */
  }
}

export function loadLocal(key = LS_AUTOSAVE): Project | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return parseProject(raw)
  } catch {
    return null
  }
}

// ── Настройки интерфейса (тема, привязки, качество) ─────────────────────────
// Хранятся отдельно от проекта: они про рабочее место, а не про содержимое.

const LS_PREFS = 'standes:prefs:v1'

export function savePrefs(prefs: Record<string, unknown>) {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(prefs))
  } catch {
    /* noop */
  }
}

export function loadPrefs(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(LS_PREFS)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(LS_AUTOSAVE)
    localStorage.removeItem(LS_KEY)
  } catch {
    /* noop */
  }
}
