import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Ban,
  Box,
  CircleQuestionMark,
  DoorOpen,
  Download,
  Expand,
  FileJson,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  Grid2x2,
  Grid3x3,
  ImageDown,
  Layers,
  LayoutDashboard,
  Link,
  Magnet,
  Moon,
  Package,
  PanelLeft,
  PanelRight,
  Power,
  Printer,
  RectangleHorizontal,
  ReceiptText,
  Redo2,
  RotateCw,
  Scissors,
  Sparkles,
  SquareDashed,
  Sun,
  Undo2,
} from 'lucide-react'

import type { Quality, ViewMode } from '@/domain/types'
import { computeBom } from '@/domain/bom'
import { computeCutlist } from '@/domain/cutlist'
import { INTL_LOCALE, plural, t } from '@/i18n'
import { appState, redo, undo, useAppStore, useTemporal } from '@/store/useStore'
import { requestFocus } from '@/three/registry'
import {
  Button,
  IconButton,
  Kbd,
  Popover,
  Segmented,
  Select,
  Slider,
  TextField,
  Tooltip,
  useThrottledCommit,
  type SegmentedOption,
} from '@/ui/controls'
import { exportBomCsv, exportCutlistCsv } from '@/export/csv'
import { exportProjectJson, importProjectFile } from '@/export/project'
import { copyToClipboard, shareUrl } from '@/export/share'

// ────────────────────────────────────────────────────────────────────────────
//  Мелкие локальные примитивы панели
// ────────────────────────────────────────────────────────────────────────────

const ICON = 14
const SW = 1.75

/** Подпись модификатора в тултипах — ровно та, что нажимает пользователь */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const MOD = IS_MAC ? '⌘' : 'Ctrl'

/** Единый способ подписать «что делает — какая клавиша» в подсказках */
const withKey = (name: string, key: string): string => t('{name} — {key}', { name, key })

/** Проценты в подсказках ползунков — разряды и знак по локали сборки */
const PERCENT = new Intl.NumberFormat(INTL_LOCALE, { style: 'percent', maximumFractionDigits: 0 })

/** Вертикальный разделитель групп */
function VDivider({ className }: { className?: string }) {
  return (
    <div
      className={`h-[20px] w-px shrink-0 ${className ?? ''}`}
      style={{ background: 'var(--border)' }}
    />
  )
}

/** Обойма для «пилюли» из нескольких кнопок — читается как один орган управления */
function Cluster({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center gap-[3px] rounded-md p-[2px]"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
    >
      {children}
    </div>
  )
}

/** Подсказка «что делает» + «какая клавиша» */
function Hint({ text, hotkey }: { text: string; hotkey?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {hotkey && <Kbd>{hotkey}</Kbd>}
    </span>
  )
}

/** Кнопка-тумблер тулбара с подсказкой и хоткеем */
function ToolBtn({
  label,
  hotkey,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  hotkey?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip content={<Hint text={label} hotkey={hotkey} />}>
      <Button
        size="xs"
        variant="ghost"
        active={active}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className="w-6 px-0"
      >
        {children}
      </Button>
    </Tooltip>
  )
}

/** Строка меню экспорта */
function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex h-[28px] w-full items-center gap-2 px-2.5 text-left text-[12px] transition-colors duration-120"
      style={{ background: 'transparent', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        className="flex shrink-0 items-center"
        style={{ color: danger ? 'var(--danger)' : 'var(--text-faint)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="label px-2.5 pt-2 pb-1" style={{ color: 'var(--text-faint)' }}>
      {children}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Логотип
// ────────────────────────────────────────────────────────────────────────────

function Mark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="1.6"
        y="2.4"
        width="14.8"
        height="12.6"
        rx="1.7"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M1.6 6.8h14.8M1.6 11h14.8M9 6.8V11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <rect x="10.1" y="7.7" width="5.2" height="2.4" rx="0.5" fill="currentColor" />
      <path
        d="M4.2 15v1.7M13.8 15v1.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Константы
// ────────────────────────────────────────────────────────────────────────────

const MODE_OPTS: SegmentedOption<ViewMode>[] = [
  {
    value: '3d',
    icon: <Box size={13} strokeWidth={SW} />,
    label: <span className="hidden min-[1600px]:inline">{t('3D')}</span>,
    title: withKey(t('Перспектива (3D)'), '1'),
  },
  {
    value: 'plan',
    icon: <Grid2x2 size={13} strokeWidth={SW} />,
    label: <span className="hidden min-[1600px]:inline">{t('План')}</span>,
    title: withKey(t('Вид сверху (план)'), '2'),
  },
  {
    value: 'front',
    icon: <RectangleHorizontal size={13} strokeWidth={SW} />,
    label: <span className="hidden min-[1600px]:inline">{t('Фасад')}</span>,
    title: withKey(t('Вид спереди (фасад)'), '3'),
  },
]

const GRID_STEPS = [10, 25, 50, 100]
const GRID_OPTS = GRID_STEPS.map((v) => ({ value: v, label: String(v) }))

const ANGLE_STEPS = [Math.PI / 36, Math.PI / 12, Math.PI / 6, Math.PI / 4, Math.PI / 2]
const ANGLE_OPTS = [
  { value: ANGLE_STEPS[0], label: '5°' },
  { value: ANGLE_STEPS[1], label: '15°' },
  { value: ANGLE_STEPS[2], label: '30°' },
  { value: ANGLE_STEPS[3], label: '45°' },
  { value: ANGLE_STEPS[4], label: '90°' },
]

const QUALITY_OPTS: { value: Quality; label: string }[] = [
  { value: 'low', label: t('Низкое') },
  { value: 'medium', label: t('Среднее') },
  { value: 'high', label: t('Высокое') },
  { value: 'ultra', label: t('Максимум') },
]

/** Ближайшее из списка — чтобы Select не «слетал» на нестандартном значении */
const nearest = (list: number[], v: number): number =>
  list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0])

// ────────────────────────────────────────────────────────────────────────────
//  Topbar
// ────────────────────────────────────────────────────────────────────────────

export function Topbar() {
  // — узкие подписки —
  const projectName = useAppStore((s) => s.project.name)
  const unitCount = useAppStore((s) => s.project.units.length)
  const mode = useAppStore((s) => s.view.mode)
  const open = useAppStore((s) => s.view.open)
  const explode = useAppStore((s) => s.view.explode)
  const quality = useAppStore((s) => s.view.quality)
  const theme = useAppStore((s) => s.view.theme)
  const snap = useAppStore((s) => s.snap)
  const bottom = useAppStore((s) => s.ui.bottom)
  const leftOpen = useAppStore((s) => s.ui.left)
  const rightOpen = useAppStore((s) => s.ui.right)

  const setProjectName = useAppStore((s) => s.setProjectName)
  const setView = useAppStore((s) => s.setView)
  const setSnap = useAppStore((s) => s.setSnap)
  const setUi = useAppStore((s) => s.setUi)
  const toast = useAppStore((s) => s.toast)
  const loadProject = useAppStore((s) => s.loadProject)
  const newProject = useAppStore((s) => s.newProject)

  const canUndo = useTemporal((s) => s.pastStates.length > 0)
  const canRedo = useTemporal((s) => s.futureStates.length > 0)

  // тему на <html> вешает App — здесь только переключатель, чтобы не было
  // двух источников правды

  // — инлайн-редактирование имени —
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const nameBoxRef = useRef<HTMLDivElement>(null)
  const skipBlur = useRef(false)

  useEffect(() => {
    if (!editing) return
    const input = nameBoxRef.current?.querySelector('input')
    input?.focus()
    input?.select()
  }, [editing])

  const startEdit = () => {
    setDraft(projectName)
    skipBlur.current = false
    setEditing(true)
  }
  const commitName = () => {
    if (!editing) return
    setEditing(false)
    const v = draft.trim()
    if (v && v !== projectName) setProjectName(v)
  }

  // — слайдеры вида (коммит не чаще кадра) —
  const commitOpen = useThrottledCommit<number>(
    useCallback((v: number) => setView({ open: v }), [setView]),
  )
  const commitExplode = useThrottledCommit<number>(
    useCallback((v: number) => setView({ explode: v }), [setView]),
  )

  // — меню экспорта —
  const exportRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const closeMenu = useCallback(() => {
    setMenu(false)
    setConfirmNew(false)
  }, [])

  /**
   * Пока меню открыто, Escape закрывает ТОЛЬКО его.
   * Слушатель на фазе перехвата: иначе глобальные хоткеи тем же нажатием
   * сняли бы ещё и выбор стеллажей.
   */
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.code !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu, closeMenu])

  const doSaveJson = () => {
    closeMenu()
    exportProjectJson(appState().project)
  }

  const doOpen = () => {
    closeMenu()
    importProjectFile()
      .then((p) => {
        loadProject(p)
        toast(t('Проект «{name}» загружен', { name: p.name }))
      })
      .catch((e: unknown) =>
        toast(t(e instanceof Error ? e.message : 'Не удалось открыть файл'), 'error'),
      )
  }

  /** Скрытые стеллажи в документы не попадают — считаем то же, что видно в окне */
  const visibleUnits = () => appState().project.units.filter((u) => !u.hidden)

  const doBom = () => {
    closeMenu()
    const p = appState().project
    const units = visibleUnits()
    if (!units.length) return toast(t('Нет ни одного видимого стеллажа'), 'warn')
    exportBomCsv(computeBom(units), p)
  }

  const doCutlist = () => {
    closeMenu()
    const p = appState().project
    const units = visibleUnits()
    if (!units.length) return toast(t('Нет ни одного видимого стеллажа'), 'warn')
    exportCutlistCsv(computeCutlist(units), p)
  }

  /**
   * Печатная спецификация: смета + раскрой по ВИДИМЫМ стеллажам,
   * иллюстрированная текущим кадром вьюпорта.
   *
   * Снимок берём JPEG'ом и без ретины: страница уходит в новое окно целиком,
   * многомегабайтный PNG внутри HTML тормозил бы печать.
   */
  const doSpec = async () => {
    closeMenu()
    try {
      const p = appState().project
      const visible = visibleUnits()
      if (!visible.length) return toast(t('Нет ни одного видимого стеллажа'), 'warn')

      const [png, pdf] = await Promise.all([import('@/export/png'), import('@/export/pdf')])
      const shot = png.captureDataUrl({ scale: 1.25, type: 'image/jpeg', quality: 0.9 })
      pdf.exportSpecHtml(
        visible.length === p.units.length ? p : { ...p, units: visible },
        computeBom(visible),
        computeCutlist(visible),
        shot ?? undefined,
      )
    } catch {
      toast(t('Не удалось собрать спецификацию'), 'error')
    }
  }

  const doScreenshot = async () => {
    closeMenu()
    try {
      const mod = await import('@/export/png')
      await mod.captureScreenshot()
    } catch {
      toast(t('Не удалось снять скриншот'), 'error')
    }
  }

  const doGltf = async () => {
    closeMenu()
    try {
      const mod = await import('@/export/gltf')
      await mod.exportGltf()
    } catch {
      toast(t('Не удалось выгрузить модель'), 'error')
    }
  }

  const doShare = async () => {
    closeMenu()
    try {
      const ok = await copyToClipboard(shareUrl(appState().project))
      toast(ok ? t('Ссылка скопирована') : t('Буфер обмена недоступен'), ok ? 'info' : 'error')
    } catch {
      toast(t('Не удалось скопировать ссылку'), 'error')
    }
  }

  const doNew = () => {
    closeMenu()
    newProject()
    toast(t('Создан новый проект'))
  }

  const snapOff = !snap.enabled
  const countWord = plural(unitCount, 'стеллаж', 'стеллажа', 'стеллажей')
  const countLabel = `${unitCount} ${countWord}`

  return (
    <header
      className="flex w-full shrink-0 items-center gap-2 overflow-hidden px-2.5"
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* ── СЛЕВА ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip content={<Hint text={t('STANDES — навести камеру на выбор')} hotkey="F" />}>
          <button
            type="button"
            onClick={() => {
              requestFocus()
              toast(t('Камера наведена на выбор'))
            }}
            aria-label={t('STANDES — навести камеру на выбор')}
            className="focus-ring flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors duration-120"
            style={{ background: 'transparent' }}
            onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="flex shrink-0 items-center" style={{ color: 'var(--accent)' }}>
              <Mark />
            </span>
            <span
              className="hidden min-[1400px]:inline"
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.14em',
                color: 'var(--text)',
              }}
            >
              STANDES
            </span>
          </button>
        </Tooltip>

        <VDivider />

        {editing ? (
          <div
            ref={nameBoxRef}
            className="flex w-[150px] items-center"
            onBlur={() => {
              if (skipBlur.current) {
                skipBlur.current = false
                return
              }
              commitName()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                skipBlur.current = true
                setEditing(false)
              }
            }}
          >
            <TextField
              value={draft}
              onChange={setDraft}
              placeholder={t('Имя проекта')}
              onEnter={commitName}
            />
          </div>
        ) : (
          <Tooltip content={t('Имя проекта — клик, чтобы переименовать')}>
            <button
              type="button"
              onClick={startEdit}
              className="focus-ring flex h-6 max-w-[110px] items-center rounded-[5px] px-1.5 transition-colors duration-120 min-[1400px]:max-w-[132px]"
              style={{ background: 'transparent' }}
              onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                className="truncate text-[12px] font-medium"
                style={{ color: 'var(--text)' }}
              >
                {projectName}
              </span>
            </button>
          </Tooltip>
        )}

        <Tooltip content={countLabel}>
          <span
            className="shrink-0 text-[11px] whitespace-nowrap"
            style={{ color: 'var(--text-faint)' }}
          >
            <span className="num">{unitCount}</span>
            <span className="hidden min-[1700px]:inline"> {countWord}</span>
          </span>
        </Tooltip>
      </div>

      {/* ── ЦЕНТР ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden">
        <Segmented<ViewMode>
          size="xs"
          value={mode}
          options={MODE_OPTS}
          onChange={(v) => setView({ mode: v })}
        />

        <VDivider />

        {/* привязки */}
        <Cluster>
          <ToolBtn
            label={snap.enabled ? t('Привязки включены') : t('Привязки выключены')}
            hotkey="S"
            active={snap.enabled}
            onClick={() => setSnap({ enabled: !snap.enabled })}
          >
            <Power
              size={ICON}
              strokeWidth={SW}
              style={{ color: snap.enabled ? 'var(--magnet)' : 'var(--text-faint)' }}
            />
          </ToolBtn>

          <div
            className="flex items-center gap-[3px] transition-opacity duration-150"
            style={{
              opacity: snapOff ? 0.4 : 1,
              transitionTimingFunction: 'var(--ease-out-expo)',
            }}
          >
            <ToolBtn
              label={t('Магниты')}
              hotkey="M"
              active={snap.magnets}
              disabled={snapOff}
              onClick={() => setSnap({ magnets: !snap.magnets })}
            >
              <Magnet
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.magnets ? 'var(--magnet)' : undefined }}
              />
            </ToolBtn>

            {/* штабель — тот же класс привязки, что и магниты, только по высоте:
                ищет опору сверху, поэтому стоит рядом с ними и гаснет вместе */}
            <ToolBtn
              label={t('Ставить друг на друга')}
              hotkey="T"
              active={snap.stack}
              disabled={snapOff}
              onClick={() => setSnap({ stack: !snap.stack })}
            >
              <Layers
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.stack ? 'var(--magnet)' : undefined }}
              />
            </ToolBtn>

            <ToolBtn
              label={t('Сетка')}
              hotkey="G"
              active={snap.grid}
              disabled={snapOff}
              onClick={() => setSnap({ grid: !snap.grid })}
            >
              <Grid3x3
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.grid ? 'var(--magnet)' : undefined }}
              />
            </ToolBtn>
            {snap.grid && (
              <Tooltip content={t('Шаг сетки, мм')}>
                <div className="flex w-[54px] shrink-0">
                  <Select<number>
                    value={nearest(GRID_STEPS, snap.gridSize)}
                    options={GRID_OPTS}
                    disabled={snapOff}
                    onChange={(v) => setSnap({ gridSize: v })}
                  />
                </div>
              </Tooltip>
            )}

            <ToolBtn
              label={t('Углы')}
              hotkey="A"
              active={snap.angle}
              disabled={snapOff}
              onClick={() => setSnap({ angle: !snap.angle })}
            >
              <RotateCw
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.angle ? 'var(--magnet)' : undefined }}
              />
            </ToolBtn>
            {snap.angle && (
              <Tooltip content={t('Шаг поворота')}>
                <div className="flex w-[54px] shrink-0">
                  <Select<number>
                    value={nearest(ANGLE_STEPS, snap.angleStep)}
                    options={ANGLE_OPTS}
                    disabled={snapOff}
                    onChange={(v) => setSnap({ angleStep: v })}
                  />
                </div>
              </Tooltip>
            )}

            <ToolBtn
              label={t('Стены')}
              hotkey="W"
              active={snap.walls}
              disabled={snapOff}
              onClick={() => setSnap({ walls: !snap.walls })}
            >
              <SquareDashed
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.walls ? 'var(--magnet)' : undefined }}
              />
            </ToolBtn>

            <ToolBtn
              label={t('Коллизии')}
              hotkey="C"
              active={snap.collide}
              disabled={snapOff}
              onClick={() => setSnap({ collide: !snap.collide })}
            >
              <Ban
                size={ICON}
                strokeWidth={SW}
                style={{ color: snap.collide ? 'var(--danger)' : undefined }}
              />
            </ToolBtn>
          </div>
        </Cluster>

        <VDivider />

        {/* открытие / разнесение */}
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content={t('Открыть двери и ящики — {p}', { p: PERCENT.format(open) })}>
            <div className="flex shrink-0 items-center gap-1">
              <DoorOpen
                size={13}
                strokeWidth={SW}
                style={{ color: open > 0 ? 'var(--accent)' : 'var(--text-faint)' }}
              />
              <div className="flex w-[70px]">
                <Slider value={open} min={0} max={1} step={0.01} onChange={commitOpen} />
              </div>
            </div>
          </Tooltip>

          <Tooltip content={t('Разнести детали — {p}', { p: PERCENT.format(explode) })}>
            <div className="flex shrink-0 items-center gap-1">
              <Expand
                size={13}
                strokeWidth={SW}
                style={{ color: explode > 0 ? 'var(--accent)' : 'var(--text-faint)' }}
              />
              <div className="flex w-[70px]">
                <Slider value={explode} min={0} max={1} step={0.01} onChange={commitExplode} />
              </div>
            </div>
          </Tooltip>
        </div>
      </div>

      {/* ── СПРАВА ──────────────────────────────────────────────────────── */}
      {/*
        Группы разведены разделителями и зазором gap-2: на узком экране подписи
        прячутся, и без этого иконки слипались бы в одну ленту.
      */}
      <div className="flex shrink-0 items-center gap-2">
        {/* история */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="xs"
            variant="ghost"
            label={withKey(t('Отменить'), `${MOD}+Z`)}
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Undo2 size={ICON} strokeWidth={SW} />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            label={withKey(t('Повторить'), `${MOD}+Shift+Z`)}
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Redo2 size={ICON} strokeWidth={SW} />
          </IconButton>
        </div>

        <VDivider />

        {/* документы: нижняя панель и экспорт */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Cluster>
            <Tooltip content={<Hint text={t('Смета и стоимость')} hotkey="B" />}>
              <Button
                size="xs"
                variant="ghost"
                active={bottom === 'bom'}
                aria-pressed={bottom === 'bom'}
                onClick={() => setUi({ bottom: bottom === 'bom' ? 'none' : 'bom' })}
                icon={
                  <ReceiptText
                    size={ICON}
                    strokeWidth={SW}
                    style={{ color: bottom === 'bom' ? 'var(--accent)' : undefined }}
                  />
                }
              >
                <span className="hidden min-[1480px]:inline">{t('Смета')}</span>
              </Button>
            </Tooltip>

            <Tooltip content={t('Карта раскроя')}>
              <Button
                size="xs"
                variant="ghost"
                active={bottom === 'cutlist'}
                aria-pressed={bottom === 'cutlist'}
                onClick={() => setUi({ bottom: bottom === 'cutlist' ? 'none' : 'cutlist' })}
                icon={
                  <LayoutDashboard
                    size={ICON}
                    strokeWidth={SW}
                    style={{ color: bottom === 'cutlist' ? 'var(--accent)' : undefined }}
                  />
                }
              >
                <span className="hidden min-[1480px]:inline">{t('Раскрой')}</span>
              </Button>
            </Tooltip>
          </Cluster>

          <Tooltip content={t('Экспорт и сохранение')}>
            <Button
              ref={exportRef}
              size="xs"
              variant="ghost"
              active={menu}
              onClick={() => (menu ? closeMenu() : setMenu(true))}
              icon={<Download size={ICON} strokeWidth={SW} />}
            >
              <span className="hidden min-[1340px]:inline">{t('Экспорт')}</span>
            </Button>
          </Tooltip>
        </div>

        <Popover open={menu} onClose={closeMenu} anchor={exportRef} align="end" width={244}>
          <div className="py-1">
            <MenuLabel>{t('Проект')}</MenuLabel>
            <MenuItem icon={<FileJson size={13} strokeWidth={SW} />} onClick={doSaveJson}>
              {t('Сохранить проект (.json)')}
            </MenuItem>
            <MenuItem icon={<FolderOpen size={13} strokeWidth={SW} />} onClick={doOpen}>
              {t('Открыть проект…')}
            </MenuItem>

            <MenuLabel>{t('Документы')}</MenuLabel>
            <MenuItem icon={<FileSpreadsheet size={13} strokeWidth={SW} />} onClick={doBom}>
              {t('Спецификация (.csv)')}
            </MenuItem>
            <MenuItem icon={<Scissors size={13} strokeWidth={SW} />} onClick={doCutlist}>
              {t('Карта раскроя (.csv)')}
            </MenuItem>
            <MenuItem icon={<Printer size={13} strokeWidth={SW} />} onClick={() => void doSpec()}>
              {t('Спецификация (для печати)')}
            </MenuItem>

            <MenuLabel>{t('Модель')}</MenuLabel>
            <MenuItem
              icon={<ImageDown size={13} strokeWidth={SW} />}
              onClick={() => void doScreenshot()}
            >
              {t('Скриншот (.png)')}
            </MenuItem>
            <MenuItem icon={<Package size={13} strokeWidth={SW} />} onClick={() => void doGltf()}>
              {t('Модель (.glb)')}
            </MenuItem>

            <div className="my-1 h-px w-full" style={{ background: 'var(--border-soft)' }} />

            <MenuItem icon={<Link size={13} strokeWidth={SW} />} onClick={() => void doShare()}>
              {t('Копировать ссылку')}
            </MenuItem>

            {confirmNew ? (
              <div className="px-2.5 pt-1.5 pb-2">
                <div className="text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                  {t('Точно? Несохранённое пропадёт')}.
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Button size="xs" variant="ghost" full onClick={() => setConfirmNew(false)}>
                    {t('Отмена')}
                  </Button>
                  <Button size="xs" variant="danger" full onClick={doNew}>
                    {t('Создать')}
                  </Button>
                </div>
              </div>
            ) : (
              <MenuItem
                danger
                icon={<FilePlus2 size={13} strokeWidth={SW} />}
                onClick={() => setConfirmNew(true)}
              >
                {t('Новый проект')}
              </MenuItem>
            )}
          </div>
        </Popover>

        <VDivider />

        <Tooltip content={t('Качество рендера')}>
          <div className="flex shrink-0 items-center gap-1">
            <Sparkles size={13} strokeWidth={SW} style={{ color: 'var(--text-faint)' }} />
            <div className="flex w-[86px]">
              <Select<Quality>
                value={quality}
                options={QUALITY_OPTS}
                onChange={(v) => setView({ quality: v })}
              />
            </div>
          </div>
        </Tooltip>

        <VDivider />

        {/* вид приложения */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="xs"
            variant="ghost"
            label={theme === 'dark' ? t('Светлая тема') : t('Тёмная тема')}
            onClick={() => setView({ theme: theme === 'dark' ? 'light' : 'dark' })}
          >
            {theme === 'dark' ? (
              <Sun size={ICON} strokeWidth={SW} />
            ) : (
              <Moon size={ICON} strokeWidth={SW} />
            )}
          </IconButton>

          <IconButton
            size="xs"
            variant="ghost"
            label={withKey(t('Справка и горячие клавиши'), 'H')}
            onClick={() => setUi({ help: true })}
          >
            <CircleQuestionMark size={ICON} strokeWidth={SW} />
          </IconButton>
        </div>

        <VDivider />

        {/* панели */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="xs"
            variant="ghost"
            label={withKey(t('Левая панель'), '\\')}
            active={leftOpen}
            onClick={() => setUi({ left: !leftOpen })}
          >
            <PanelLeft
              size={ICON}
              strokeWidth={SW}
              style={{ color: leftOpen ? 'var(--text)' : 'var(--text-faint)' }}
            />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            label={t('Правая панель')}
            active={rightOpen}
            onClick={() => setUi({ right: !rightOpen })}
          >
            <PanelRight
              size={ICON}
              strokeWidth={SW}
              style={{ color: rightOpen ? 'var(--text)' : 'var(--text-faint)' }}
            />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
