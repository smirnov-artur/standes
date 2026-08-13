/**
 * Шапка клиентского режима.
 *
 * Здесь всего пять вещей: кто мы, что показываем, сколько стоит,
 * как оставить заявку и как поделиться. Всё остальное — в режиме менеджера,
 * ссылка на который стоит с краю и намеренно почти не видна.
 */

import { Link2, Moon, Sun } from 'lucide-react'

import type { ViewMode } from '@/domain/types'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import { appState, useAppStore } from '@/store/useStore'
import { copyToClipboard, shareUrl } from '@/export/share'
import { Button, IconButton } from '@/ui/controls'

import { useOrderSummary } from './Summary'

const ICON = 15
const SW = 1.75

/** Знак: стойка с полками — то, что клиент и покупает */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.4" width="15.6" height="14.4" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.2 7.2h15.6M2.2 11.6h15.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="4.2" y="12.6" width="11.6" height="2.4" rx="0.6" fill="currentColor" />
      <path d="M5 16.8v1.4M15 16.8v1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Крупный переключатель вида: клиенту нужны только зал и план */
function ViewSwitch() {
  const mode = useAppStore((s) => s.view.mode)
  const setView = useAppStore((s) => s.setView)
  const opts: { value: ViewMode; label: string }[] = [
    { value: '3d', label: t('3D') },
    { value: 'plan', label: t('План') },
  ]

  return (
    <div
      className="inline-flex shrink-0 gap-0.5 rounded-md p-[3px]"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
    >
      {opts.map((o) => {
        const on = o.value === mode
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => setView({ mode: o.value })}
            className="focus-ring inline-flex h-[28px] items-center justify-center rounded-[6px] px-4 text-[12.5px] font-medium transition-colors duration-120"
            style={{
              background: on ? 'var(--bg-active)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-faint)',
              boxShadow: on ? 'var(--shadow-sm)' : undefined,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function ClientTopbar() {
  const theme = useAppStore((s) => s.view.theme)
  const setView = useAppStore((s) => s.setView)
  const setUi = useAppStore((s) => s.setUi)
  const toast = useAppStore((s) => s.toast)
  const { price, sections } = useOrderSummary()

  const doShare = async () => {
    try {
      const ok = await copyToClipboard(shareUrl(appState().project))
      toast(
        ok ? t('Ссылка на проект скопирована') : t('Буфер обмена недоступен'),
        ok ? 'info' : 'error',
      )
    } catch {
      toast(t('Не удалось скопировать ссылку'), 'error')
    }
  }

  return (
    <header
      className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-4"
      style={{
        height: 56,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* ── СЛЕВА ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex shrink-0 items-center" style={{ color: 'var(--accent)' }}>
          <Mark />
        </span>
        <span className="flex flex-col leading-none">
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--text)' }}>
            STANDES
          </span>
          <span
            className="mt-[3px] hidden min-[900px]:inline"
            style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-faint)' }}
          >
            {t('торговое оборудование')}
          </span>
        </span>
      </div>

      {/* ── ЦЕНТР ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <ViewSwitch />
      </div>

      {/* ── СПРАВА ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className="num hidden whitespace-nowrap min-[700px]:inline"
          style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}
        >
          {money(price)}
        </span>

        <Button size="md" variant="primary" disabled={sections === 0} onClick={() => setUi({ lead: true })}>
          {t('Оставить заявку')}
        </Button>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton size="sm" variant="ghost" label={t('Поделиться ссылкой')} onClick={() => void doShare()}>
            <Link2 size={ICON} strokeWidth={SW} />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={theme === 'dark' ? t('Светлая тема') : t('Тёмная тема')}
            onClick={() => setView({ theme: theme === 'dark' ? 'light' : 'dark' })}
          >
            {theme === 'dark' ? <Sun size={ICON} strokeWidth={SW} /> : <Moon size={ICON} strokeWidth={SW} />}
          </IconButton>
        </div>

        <button
          type="button"
          onClick={() => setUi({ audience: 'pro' })}
          className="focus-ring hidden shrink-0 whitespace-nowrap transition-colors duration-120 min-[900px]:inline"
          style={{ fontSize: 11, color: 'var(--text-faint)', background: 'transparent' }}
          onPointerEnter={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
          onPointerLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
        >
          {t('Режим менеджера')}
        </button>
      </div>
    </header>
  )
}
