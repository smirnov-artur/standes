/**
 * Заявка покупателя.
 *
 * Бэкенда у проекта нет, и врать про «мы вам перезвоним» нечестно.
 * Поэтому заявка складывается в localStorage и копируется в буфер обмена —
 * дальше её можно просто вставить в почту или мессенджер менеджеру.
 * Экран успеха говорит об этом прямым текстом.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'

import { outerHeight, outerWidth, retailSpec } from '@/domain/frame'
import { fmtLen } from '@/domain/format'
import { getMaterial } from '@/domain/materials'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import type { ShelfUnit } from '@/domain/types'
import { useAppStore } from '@/store/useStore'
import { copyToClipboard } from '@/export/share'
import { LS_NS } from '@/export/project'
import { Button } from '@/ui/controls'

import { shelfCount, useOrderSummary } from './Summary'

/** Заявки русского и английского сайта не смешиваются — см. LS_NS. */
const STORE_KEY = `${LS_NS}:leads`

// ────────────────────────────────────────────────────────────────────────────
//  Сводка заказа
// ────────────────────────────────────────────────────────────────────────────

interface LineItem {
  name: string
  width: number
  height: number
  depth: number
  shelves: number
  color: string
  priceRail: boolean
  tilt: boolean
}

function lineItems(units: ShelfUnit[]): LineItem[] {
  return units.map((u) => {
    const r = retailSpec(u.frame)
    return {
      name: u.name,
      width: Math.round(outerWidth(u.frame)),
      height: Math.round(outerHeight(u.frame)),
      depth: Math.round(u.frame.depth),
      shelves: shelfCount(u),
      color: getMaterial(u.materials.carcass).name,
      priceRail: u.frame.style === 'retail' && r.priceRail,
      tilt: u.frame.style === 'retail' && r.tilt > 0,
    }
  })
}

function describe(item: LineItem, i: number): string {
  const extra = [
    item.priceRail ? t('ценники') : null,
    item.tilt ? t('наклонные полки') : null,
  ].filter(Boolean)
  return (
    `${i + 1}. ${t(item.name)} — ${item.width} × ${item.height} × ${item.depth} ${t('мм')}, ` +
    `${t('полок {n}', { n: item.shelves })}, ${t('цвет')}: ${t(item.color)}` +
    (extra.length ? `, ${extra.join(', ')}` : '')
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Поля
// ────────────────────────────────────────────────────────────────────────────

function Labeled({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      {children}
      {error && (
        <span className="text-[11px] leading-tight" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      )}
    </label>
  )
}

const inputStyle = (bad: boolean): React.CSSProperties => ({
  background: 'var(--bg-input)',
  border: `1px solid ${bad ? 'var(--danger)' : 'var(--border)'}`,
  color: 'var(--text)',
})

// ────────────────────────────────────────────────────────────────────────────

export function LeadForm() {
  const open = useAppStore((s) => s.ui.lead)
  const setUi = useAppStore((s) => s.setUi)
  const { units, sections, totalWidth, shelves, price } = useOrderSummary()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')
  const [tried, setTried] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const close = () => setUi({ lead: false })

  // каждое открытие — чистый бланк
  useEffect(() => {
    if (!open) return
    setTried(false)
    setSent(false)
    setCopied(false)
  }, [open])

  /**
   * Escape гасим на фазе перехвата: иначе тем же нажатием глобальные хоткеи
   * снимут ещё и выбор секции под модалкой.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.code !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setUi({ lead: false })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setUi])

  const items = useMemo(() => lineItems(units), [units])

  const digits = phone.replace(/\D/g, '').length
  const nameBad = tried && name.trim().length === 0
  const phoneBad = tried && digits < 10

  if (!open) return null

  const submit = () => {
    setTried(true)
    if (name.trim().length === 0 || digits < 10) return

    const text = [
      t('Заявка STANDES'),
      t('Секций: {n}', { n: sections }),
      t('Общая длина: {v}', { v: fmtLen(totalWidth) }),
      t('Полок всего: {n}', { n: shelves }),
      t('Ориентировочная стоимость: {sum}', { sum: money(price) }),
      '',
      ...items.map(describe),
      '',
      t('Имя: {v}', { v: name.trim() }),
      t('Телефон: {v}', { v: phone.trim() }),
      ...(email.trim() ? [t('E-mail: {v}', { v: email.trim() })] : []),
      ...(comment.trim() ? [t('Комментарий: {v}', { v: comment.trim() })] : []),
    ].join('\n')

    try {
      const raw = localStorage.getItem(STORE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      const list: unknown[] = Array.isArray(parsed) ? parsed : []
      list.push({
        at: new Date().toISOString(),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        comment: comment.trim(),
        order: { sections, totalWidth, shelves, price, items },
        text,
      })
      localStorage.setItem(STORE_KEY, JSON.stringify(list))
    } catch {
      /* приватный режим или переполненное хранилище — заявка всё равно в буфере */
    }

    void copyToClipboard(text).then((ok) => setCopied(ok))
    setSent(true)
  }

  return (
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklab, var(--bg-app) 72%, transparent)', backdropFilter: 'blur(6px)' }}
      onPointerDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) close()
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('Заявка')}
        className="anim-in flex max-h-full w-[440px] max-w-full flex-col overflow-hidden rounded-xl"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* — шапка — */}
        <div
          className="flex h-[48px] shrink-0 items-center justify-between gap-3 px-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
            {sent ? t('Заявка сохранена') : t('Оставить заявку')}
          </span>
          <button
            type="button"
            aria-label={t('Закрыть')}
            onClick={close}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-120"
            style={{ color: 'var(--text-faint)', background: 'transparent' }}
            onPointerEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onPointerLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {sent ? (
          // ── экран успеха ──────────────────────────────────────────────
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: 'color-mix(in oklab, var(--ok) 18%, transparent)',
                color: 'var(--ok)',
              }}
            >
              <Check size={24} strokeWidth={2} />
            </span>
            <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
              {t('Заявка сохранена')}
            </div>
            <div className="text-[12.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
              {copied
                ? t('Бэкенд не подключён — заявка скопирована в буфер обмена и сохранена локально')
                : t('Бэкенд не подключён — заявка сохранена локально, буфер обмена оказался недоступен')}
            </div>
            <Button size="md" full variant="primary" className="mt-2" onClick={close}>
              {t('Закрыть')}
            </Button>
          </div>
        ) : (
          // ── форма ──────────────────────────────────────────────────────
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
            <Labeled label={t('Имя')} error={nameBad ? t('Как к вам обращаться?') : undefined}>
              <input
                type="text"
                value={name}
                autoFocus
                placeholder={t('Иван')}
                onChange={(e) => setName(e.target.value)}
                className="focus-ring h-[34px] rounded-md px-2.5 text-[13px] outline-none"
                style={inputStyle(nameBad)}
              />
            </Labeled>

            <Labeled
              label={t('Телефон')}
              error={phoneBad ? t('Нужен номер целиком — не меньше 10 цифр') : undefined}
            >
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder={t('+7 900 000-00-00')}
                onChange={(e) => setPhone(e.target.value)}
                className="focus-ring h-[34px] rounded-md px-2.5 text-[13px] outline-none"
                style={inputStyle(phoneBad)}
              />
            </Labeled>

            <Labeled label={t('E-mail — если удобнее письмом')}>
              <input
                type="email"
                inputMode="email"
                value={email}
                placeholder={t('mail@example.ru')}
                onChange={(e) => setEmail(e.target.value)}
                className="focus-ring h-[34px] rounded-md px-2.5 text-[13px] outline-none"
                style={inputStyle(false)}
              />
            </Labeled>

            <Labeled label={t('Комментарий')}>
              <textarea
                rows={3}
                value={comment}
                placeholder={t('Город, сроки, что планируете выкладывать')}
                onChange={(e) => setComment(e.target.value)}
                className="focus-ring resize-none rounded-md px-2.5 py-2 text-[13px] leading-snug outline-none"
                style={inputStyle(false)}
              />
            </Labeled>

            <Button size="md" full variant="primary" className="mt-1" onClick={submit}>
              {t('Отправить заявку')}
            </Button>

            {/* — что именно уходит — */}
            <details className="mt-1">
              <summary
                className="cursor-pointer list-none text-[11.5px] select-none"
                style={{ color: 'var(--text-faint)' }}
              >
                {t('Что отправляем: {n} секц. · {len} · {sum}', {
                  n: sections,
                  len: fmtLen(totalWidth),
                  sum: money(price),
                })}
              </summary>
              <div
                className="mt-2 flex flex-col gap-1 rounded-md p-2.5"
                style={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border)' }}
              >
                {items.length === 0 && (
                  <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                    {t('В заказе пока нет секций')}
                  </span>
                )}
                {items.map((it, i) => (
                  <span
                    key={`${it.name}-${i}`}
                    className="text-[11.5px] leading-snug"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {describe(it, i)}
                  </span>
                ))}
                <span className="mt-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                  {t('Полок всего: {n} · цена ориентировочная', { n: shelves })}
                </span>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
