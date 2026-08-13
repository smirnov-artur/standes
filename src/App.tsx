import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useStore'
import type { SnapSettings, ViewSettings } from '@/domain/types'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { LOCALE, t } from '@/i18n'

import { Topbar } from '@/ui/Topbar'
import { LeftPanel } from '@/ui/LeftPanel'
import { Inspector } from '@/ui/Inspector'
import { BottomPanel } from '@/ui/BottomPanel'
import { StatusBar } from '@/ui/StatusBar'
import { Toasts } from '@/ui/Toasts'
import { HelpOverlay } from '@/ui/HelpOverlay'
import { Shortcuts } from '@/ui/Shortcuts'
import { Viewport } from '@/three/Viewport'

import { ClientShell } from '@/ui/client/Shell'
import { LeadForm } from '@/ui/client/LeadForm'

import { loadLocal, loadPrefs, savePrefs, saveLocal } from '@/export/project'
import { clearShareFromUrl, readShareFromUrl } from '@/export/share'

declare global {
  interface Window {
    /** Отладочный доступ к стору — только в дев-режиме */
    __standes?: typeof useAppStore
  }
}

if (import.meta.env.DEV) window.__standes = useAppStore

/** Тема применяется к <html>, чтобы CSS-переменные подхватились везде, включая порталы */
function useTheme() {
  const theme = useAppStore((s) => s.view.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])
}

/**
 * index.html один на обе сборки, поэтому язык страницы и заголовок вкладки
 * выставляются из кода. Для поисковиков и скринридеров lang важнее, чем кажется.
 */
function useDocumentLocale() {
  useEffect(() => {
    document.documentElement.lang = LOCALE
    document.title = t('STANDES — 3D конфигуратор торговых стеллажей')
  }, [])
}

/** Загрузка проекта из ссылки, иначе — из автосохранения. Один раз при старте. */
function useBoot() {
  const loadProject = useAppStore((s) => s.loadProject)
  const toast = useAppStore((s) => s.toast)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    try {
      const shared = readShareFromUrl()
      if (shared) {
        loadProject(shared)
        clearShareFromUrl()
        toast(t('Проект загружен по ссылке'))
        return
      }
      const saved = loadLocal()
      if (saved) {
        loadProject(saved)
        toast(t('Восстановлен последний проект'))
      }
    } catch {
      /* стартуем с дефолтного проекта */
    }
  }, [loadProject, toast])
}

/** Автосохранение в localStorage, не чаще раза в 1.5 с */
function useAutosave() {
  const project = useAppStore((s) => s.project)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => saveLocal(project), 1500)
    return () => void (timer.current && clearTimeout(timer.current))
  }, [project])
}

/**
 * Настройки рабочего места (тема, качество, привязки, режим) живут отдельно
 * от проекта и переживают перезагрузку.
 */
function usePrefs() {
  const view = useAppStore((s) => s.view)
  const snap = useAppStore((s) => s.snap)
  const audience = useAppStore((s) => s.ui.audience)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const prefs = loadPrefs()
    if (!prefs) return
    const { setView, setSnap, setUi } = useAppStore.getState()
    if (prefs.view && typeof prefs.view === 'object') setView(prefs.view as Partial<ViewSettings>)
    if (prefs.snap && typeof prefs.snap === 'object') setSnap(prefs.snap as Partial<SnapSettings>)
    if (prefs.audience === 'client' || prefs.audience === 'pro') setUi({ audience: prefs.audience })
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    // режим вида и раскрытие дверей — состояние момента, а не настройка: не сохраняем
    const { mode, open, explode, ...rest } = view
    savePrefs({ view: rest, snap, audience })
  }, [view, snap, audience])
}

/** Оболочка менеджера: инспектор, смета, раскрой — всё, что нужно для производства */
function ProShell() {
  const left = useAppStore((s) => s.ui.left)
  const right = useAppStore((s) => s.ui.right)
  const bottom = useAppStore((s) => s.ui.bottom)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <ErrorBoundary area={t('Верхняя панель')} compact>
        <Topbar />
      </ErrorBoundary>

      <div className="flex min-h-0 min-w-0 flex-1">
        {left && (
          <aside
            className="flex h-full shrink-0 flex-col"
            style={{ width: 'var(--panel-w-left)', borderRight: '1px solid var(--border)' }}
          >
            <ErrorBoundary area={t('Список стеллажей')} compact>
              <LeftPanel />
            </ErrorBoundary>
          </aside>
        )}

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <ErrorBoundary area={t('3D-сцена')}>
            <Viewport />
          </ErrorBoundary>

          {bottom !== 'none' && (
            <ErrorBoundary area={t('Смета')} compact>
              <BottomPanel />
            </ErrorBoundary>
          )}
        </main>

        {right && (
          <aside
            className="flex h-full shrink-0 flex-col"
            style={{ width: 'var(--panel-w-right)', borderLeft: '1px solid var(--border)' }}
          >
            <ErrorBoundary area={t('Инспектор')} compact>
              <Inspector />
            </ErrorBoundary>
          </aside>
        )}
      </div>

      <StatusBar />
    </div>
  )
}

export default function App() {
  useTheme()
  useDocumentLocale()
  useBoot()
  useAutosave()
  usePrefs()

  const audience = useAppStore((s) => s.ui.audience)

  return (
    <>
      {audience === 'client' ? (
        <ErrorBoundary area={t('Клиентский режим')}>
          <ClientShell>
            <ErrorBoundary area={t('3D-сцена')}>
              <Viewport />
            </ErrorBoundary>
          </ClientShell>
        </ErrorBoundary>
      ) : (
        <ProShell />
      )}

      <Toasts />
      <HelpOverlay />
      <Shortcuts />
      <ErrorBoundary area={t('Заявка')} compact>
        <LeadForm />
      </ErrorBoundary>
    </>
  )
}
