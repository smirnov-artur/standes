/**
 * Глобальные горячие клавиши.
 *
 * Компонент ничего не рисует и НЕ подписывается на стор — состояние читается
 * через `useAppStore.getState()` в момент нажатия. Так один слушатель живёт
 * всё время жизни приложения и не вызывает перерисовок.
 *
 * Раскладка определяется по `event.code` (физическая клавиша), а не по `key`:
 * интерфейс русский, и в кириллической раскладке `key` для «M» — это «ь».
 *
 * ЕДИНЫЙ СПИСОК БИНДИНГОВ (он же в тултипах Topbar и в HelpOverlay):
 *   Ctrl/⌘+Z — отменить, Ctrl+Shift+Z и Ctrl+Y — вернуть
 *   Ctrl+D — дублировать, Ctrl+A — выбрать всё
 *   Ctrl+S — сохранить в файл, Ctrl+O — открыть файл
 *   Delete / Backspace — удалить выбранное
 *   Esc — послойно: оверлей → кисть → выбор
 *   S — привязки целиком, M — магниты, G — сетка,
 *   A — углы, W — стены, C — контроль пересечений
 *   R / Shift+R — поворот на ±90°
 *   ↑↓←→ — сдвиг на шаг сетки (Shift ×10, Alt — 1 мм)
 *   1 / 2 / 3 — 3D / план / фасад
 *   B — смета внизу, F — фокус камеры, H — справка, \ — левая панель
 */

import { useEffect } from 'react'

import type { ViewMode } from '@/domain/types'
import { exportProjectJson, importProjectFile } from '@/export/project'
import { t } from '@/i18n'
import { redo, undo, useAppStore } from '@/store/useStore'
import { requestFocus } from '@/three/registry'

// ────────────────────────────────────────────────────────────────────────────

/**
 * Ввод текста — хоткеи молчат.
 *
 * Важно: событие приходит с `target` = document.body, когда фокуса нет ни на чём
 * (обычное состояние после клика по сцене), и с `target` = кнопка тулбара, если
 * по ней только что кликнули. Оба случая — НЕ ввод, проверка их пропускает.
 * Глушим только поля ввода, списки и contenteditable.
 */
function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true
  // isContentEditable наследуется потомками редактируемой области
  return el.isContentEditable === true
}

/** Клавиши, которые имеет смысл повторять автоповтором */
const REPEATABLE = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyZ',
  'KeyY',
  'Delete',
  'Backspace',
])

/** Частные тумблеры привязок — работают только при включённом общем рубильнике S */
const SNAP_KEYS = new Set(['KeyM', 'KeyG', 'KeyA', 'KeyW', 'KeyC'])

const VIEW_BY_DIGIT: Record<string, ViewMode> = { '1': '3d', '2': 'plan', '3': 'front' }

/** «Digit2» / «Numpad2» → «2» */
function digitOf(code: string): string | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  return m ? m[1] : null
}

// ── операции над выбором ────────────────────────────────────────────────────

/** Выбранные и незаблокированные — только их можно двигать и вращать */
function movableSelection() {
  const s = useAppStore.getState()
  const sel = new Set(s.sel.units)
  return s.project.units.filter((u) => sel.has(u.id) && !u.locked)
}

function nudge(dx: number, dz: number) {
  const s = useAppStore.getState()
  for (const u of movableSelection()) {
    s.setUnitTransform(u.id, { x: u.pos.x + dx, z: u.pos.z + dz }, u.rotY)
  }
}

function rotate(delta: number) {
  const s = useAppStore.getState()
  for (const u of movableSelection()) {
    s.setUnitTransform(u.id, { ...u.pos }, u.rotY + delta)
  }
}

function removeSelected() {
  const s = useAppStore.getState()
  if (!s.sel.units.length) return
  const sel = new Set(s.sel.units)
  const ids = s.project.units.filter((u) => sel.has(u.id) && !u.locked).map((u) => u.id)
  if (!ids.length) {
    s.toast(t('Выбранное заблокировано'), 'warn')
    return
  }
  s.removeUnits(ids)
}

function saveProject() {
  const s = useAppStore.getState()
  try {
    exportProjectJson(s.project)
    s.toast(t('Проект сохранён в файл'))
  } catch {
    s.toast(t('Не удалось сохранить файл'), 'error')
  }
}

function openProject() {
  importProjectFile()
    .then((p) => {
      const st = useAppStore.getState()
      st.loadProject(p)
      st.toast(t('Открыт проект «{name}»', { name: p.name }))
    })
    .catch((e: unknown) => {
      const msg = t(e instanceof Error ? e.message : 'Не удалось открыть файл')
      useAppStore.getState().toast(msg, 'error')
    })
}

// ────────────────────────────────────────────────────────────────────────────

export function Shortcuts(): null {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (isEditing(e.target)) return

      const s = useAppStore.getState()
      const mod = e.ctrlKey || e.metaKey

      // ── Escape работает всегда, даже поверх справки ──
      if (e.code === 'Escape') {
        // послойное закрытие: сначала оверлеи, затем кисть, затем выбор
        if (s.ui.help || s.ui.presets) {
          s.setUi({ help: false, presets: false })
          return
        }
        if (s.ui.brush) {
          s.setUi({ brush: null })
          return
        }
        s.clearSelection()
        s.setUi({ brush: null, help: false, presets: false })
        return
      }

      if (e.repeat && !REPEATABLE.has(e.code)) return

      // модальная галерея пресетов забирает клавиатуру себе — ей хватает Escape
      if (s.ui.presets) return

      // H — тумблер справки: должен и открывать, и закрывать
      if (e.code === 'KeyH' && !mod && !e.altKey && !e.shiftKey) {
        s.setUi({ help: !s.ui.help })
        return
      }

      // пока открыта справка — остальные хоткеи не работают
      if (s.ui.help) return

      // ── команды с модификатором ──
      // altKey отсекаем: на Windows AltGr приходит как Ctrl+Alt, и без этого
      // ввод символов правым Alt дёргал бы «Выделить всё» и «Сохранить»
      if (mod) {
        if (e.altKey) return
        switch (e.code) {
          case 'KeyZ':
            e.preventDefault()
            if (e.shiftKey) redo()
            else undo()
            return
          case 'KeyY':
            e.preventDefault()
            redo()
            return
          case 'KeyD':
            e.preventDefault()
            if (s.sel.units.length) s.duplicateUnits(s.sel.units)
            return
          case 'KeyA':
            e.preventDefault()
            s.selectAll()
            return
          case 'KeyS':
            e.preventDefault()
            saveProject()
            return
          case 'KeyO':
            e.preventDefault()
            openProject()
            return
          default:
            return
        }
      }

      if (e.altKey && !e.code.startsWith('Arrow')) return

      // В тулбаре частные тумблеры привязок неактивны, пока выключен общий
      // рубильник, — клавиши обязаны вести себя так же, иначе тост врал бы
      if (SNAP_KEYS.has(e.code) && !s.snap.enabled) {
        s.toast(t('Привязки выключены — включите их клавишей S'), 'warn')
        return
      }

      // ── одиночные клавиши ──
      switch (e.code) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          removeSelected()
          return

        // ── тумблеры привязок: те же клавиши, что подписаны в тулбаре ──
        case 'KeyS': {
          const on = !s.snap.enabled
          s.setSnap({ enabled: on })
          s.toast(on ? t('Привязки включены') : t('Привязки выключены'))
          return
        }

        case 'KeyM': {
          const on = !s.snap.magnets
          s.setSnap({ magnets: on })
          s.toast(on ? t('Магниты включены') : t('Магниты выключены'))
          return
        }

        case 'KeyG': {
          const on = !s.snap.grid
          s.setSnap({ grid: on })
          s.toast(on ? t('Привязка к сетке включена') : t('Привязка к сетке выключена'))
          return
        }

        case 'KeyA': {
          const on = !s.snap.angle
          s.setSnap({ angle: on })
          s.toast(on ? t('Привязка углов включена') : t('Привязка углов выключена'))
          return
        }

        case 'KeyW': {
          const on = !s.snap.walls
          s.setSnap({ walls: on })
          s.toast(on ? t('Привязка к стенам включена') : t('Привязка к стенам выключена'))
          return
        }

        case 'KeyC': {
          const on = !s.snap.collide
          s.setSnap({ collide: on })
          s.toast(on ? t('Контроль пересечений включён') : t('Контроль пересечений выключен'))
          return
        }

        case 'KeyR':
          rotate(e.shiftKey ? -Math.PI / 2 : Math.PI / 2)
          return

        case 'KeyB':
          s.setUi({ bottom: s.ui.bottom === 'bom' ? 'none' : 'bom' })
          return

        case 'KeyF':
          requestFocus() // сцена подписана на 'standes:focus'
          s.toast(t('Камера наведена на выбор'))
          return

        case 'Backslash':
          s.setUi({ left: !s.ui.left })
          return

        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          // preventDefault до проверки выбора: иначе Alt+← увела бы браузер назад
          e.preventDefault()
          if (!s.sel.units.length) return
          // Alt — точная подгонка по 1 мм, Shift — крупный шаг
          const grid = Math.max(1, s.snap.gridSize)
          const step = e.altKey ? 1 : grid * (e.shiftKey ? 10 : 1)
          const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0
          const dz = e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0
          nudge(dx, dz)
          return
        }

        default: {
          if (e.shiftKey) return
          const d = digitOf(e.code)
          const mode = d ? VIEW_BY_DIGIT[d] : undefined
          if (mode) s.setView({ mode })
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
