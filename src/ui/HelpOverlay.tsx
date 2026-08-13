/**
 * Справка по управлению. Открывается по «H» (или из тулбара), закрывается
 * по Esc, клику вне карточки и крестику.
 */

import { Keyboard, Magnet, MousePointer2, X } from 'lucide-react'
import { Fragment, useEffect, useRef, type ReactNode } from 'react'

import { t } from '@/i18n'
import { Button, Divider, IconButton, Kbd, Scroll } from '@/ui/controls'
import { useAppStore } from '@/store/useStore'

// ────────────────────────────────────────────────────────────────────────────

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const MOD = IS_MAC ? '⌘' : 'Ctrl'
const ARROWS = '↑↓←→'

interface Hotkey {
  combos: string[][]
  /** разделитель внутри комбинации */
  sep?: string
  text: string
}

const HOTKEYS: Hotkey[] = [
  { combos: [[MOD, 'Z']], text: t('Отменить') },
  { combos: [[MOD, 'Shift', 'Z'], [MOD, 'Y']], text: t('Вернуть') },
  { combos: [['Del'], ['⌫']], text: t('Удалить выбранное') },
  { combos: [[MOD, 'D']], text: t('Дублировать') },
  { combos: [[MOD, 'A']], text: t('Выбрать всё') },
  { combos: [['Esc']], text: t('Снять выбор / закрыть') },
  { combos: [['S']], text: t('Привязки вкл/выкл') },
  { combos: [['M']], text: t('Магниты вкл/выкл') },
  { combos: [['G']], text: t('Сетка вкл/выкл') },
  { combos: [['A']], text: t('Привязка углов вкл/выкл') },
  { combos: [['W']], text: t('Привязка к стенам вкл/выкл') },
  { combos: [['C']], text: t('Контроль пересечений вкл/выкл') },
  { combos: [['R']], text: t('Повернуть на 90°') },
  { combos: [['Shift', 'R']], text: t('Повернуть на −90°') },
  { combos: [[ARROWS]], text: t('Сдвиг на шаг сетки') },
  { combos: [['Shift', ARROWS]], text: t('Сдвиг ×10') },
  { combos: [['Alt', ARROWS]], text: t('Сдвиг на 1 мм') },
  { combos: [['1', '2', '3']], sep: '/', text: t('Вид: 3D / план / фасад') },
  { combos: [['B']], text: t('Смета внизу') },
  { combos: [['F']], text: t('Фокус камеры') },
  { combos: [['H']], text: t('Эта справка') },
  { combos: [['\\']], text: t('Левая панель') },
  { combos: [[MOD, 'S']], text: t('Сохранить в файл') },
  { combos: [[MOD, 'O']], text: t('Открыть файл') },
]

const MOUSE: [string, string][] = [
  [t('ЛКМ по стеллажу'), t('Выбрать')],
  [t('Перетаскивание'), t('Двигать по полу')],
  [t('ЛКМ по ячейке'), t('Редактировать ячейку')],
  [t('ПКМ / средняя'), t('Вращать и панорамировать камеру')],
  [t('Колесо'), t('Приблизить и отдалить')],
  [t('Двойной клик'), t('Сфокусировать камеру')],
]

const MAGNETS: string[] = [
  t('Стеллажи прилипают друг к другу гранями и углами — бок к боку, спина к спине, угол к углу.'),
  t('Радиус срабатывания настраивается в панели привязок: чем он меньше, тем точнее нужно подвести.'),
  t('Зажатый Alt во время перетаскивания временно отключает все привязки — для ручной постановки.'),
  t('Подсветка показывает будущий стык: синяя — примыкание к соседу, зелёная — к стене или сетке.'),
]

// ── мелкие блоки ────────────────────────────────────────────────────────────

function Head({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="shrink-0" style={{ color: 'var(--accent)' }}>
        {icon}
      </span>
      <span className="label" style={{ color: 'var(--text-dim)' }}>
        {title}
      </span>
      <div className="ml-1 h-px flex-1" style={{ background: 'var(--border-soft)' }} />
    </div>
  )
}

function Keys({ combos, sep = '+' }: { combos: string[][]; sep?: string }) {
  return (
    <span className="flex w-[116px] shrink-0 flex-wrap items-center gap-x-1 gap-y-[3px]">
      {combos.map((combo, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              /
            </span>
          )}
          {combo.map((k, j) => (
            <Fragment key={j}>
              {j > 0 && sep && (
                <span className="text-[9.5px]" style={{ color: 'var(--text-faint)' }}>
                  {sep}
                </span>
              )}
              <Kbd>{k}</Kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export function HelpOverlay() {
  const open = useAppStore((s) => s.ui.help)
  const setUi = useAppStore((s) => s.setUi)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUi({ help: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setUi])

  if (!open) return null

  const close = () => setUi({ help: false })

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-6"
      style={{
        background: 'color-mix(in oklab, var(--bg-app) 78%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Справка STANDES')}
        className="anim-in flex w-[620px] max-w-full flex-col overflow-hidden rounded-lg"
        style={{
          maxHeight: '80vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* заголовок */}
        <div
          className="flex h-[40px] shrink-0 items-center gap-2 px-3.5"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-2)' }}
        >
          <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            {t('STANDES — как пользоваться')}
          </span>
          <IconButton label={t('Закрыть')} variant="quiet" size="xs" onClick={close}>
            <X size={14} strokeWidth={1.75} />
          </IconButton>
        </div>

        {/* содержание */}
        <Scroll className="px-3.5 py-3">
          {/* Мышь */}
          <Head icon={<MousePointer2 size={13} strokeWidth={1.75} />} title={t('Мышь')} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-[2px]">
            {MOUSE.map(([action, what]) => (
              <div key={action} className="flex h-[22px] items-center gap-2 text-[11.5px]">
                <span className="w-[112px] shrink-0 truncate" style={{ color: 'var(--text)' }}>
                  {action}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
                  {what}
                </span>
              </div>
            ))}
          </div>

          <Divider className="my-3" />

          {/* Клавиши */}
          <Head icon={<Keyboard size={13} strokeWidth={1.75} />} title={t('Клавиши')} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-[2px]">
            {HOTKEYS.map((h) => (
              <div key={h.text} className="flex min-h-[22px] items-center gap-2 text-[11.5px]">
                <Keys combos={h.combos} sep={h.sep} />
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
                  {h.text}
                </span>
              </div>
            ))}
          </div>

          <Divider className="my-3" />

          {/* Магниты */}
          <Head icon={<Magnet size={13} strokeWidth={1.75} />} title={t('Магниты')} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {MAGNETS.map((line) => (
              <div key={line} className="flex gap-1.5 text-[11.5px] leading-[1.5]">
                <span aria-hidden className="shrink-0" style={{ color: 'var(--magnet)' }}>
                  •
                </span>
                <span style={{ color: 'var(--text-dim)' }}>{line}</span>
              </div>
            ))}
          </div>
        </Scroll>

        {/* подвал */}
        <div
          className="flex h-[46px] shrink-0 items-center justify-between gap-3 px-3.5"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel-2)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {t('Справка вызывается клавишей')} <Kbd>H</Kbd>
          </span>
          <Button ref={okRef} variant="primary" size="sm" onClick={close}>
            {t('Понятно')}
          </Button>
        </div>
      </div>
    </div>
  )
}
