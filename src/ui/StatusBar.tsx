/**
 * Нижняя строка состояния: выбор и габарит слева, событие перетаскивания
 * по центру, итоги сметы и FPS справа.
 *
 * Подписки — только узкие: строка перерисовывается при смене выбора,
 * позиции активного юнита и состава проекта, но не «на всё подряд».
 */

import { Boxes, Layers, Magnet, Ruler, TriangleAlert, Wallet } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { computeBom } from '@/domain/bom'
import { fmtDims, fmtNum } from '@/domain/format'
import { elevationOf, outerSize } from '@/domain/frame'
import type { Vec2 } from '@/domain/types'
import { t } from '@/i18n'
import { money } from '@/i18n/currency'
import { useAppStore, type AppState } from '@/store/useStore'
import { Tooltip } from '@/ui/controls'

// ── FPS ─────────────────────────────────────────────────────────────────────

/** Скользящее среднее за 30 кадров, публикуется раз в 500 мс */
function useFps(): number {
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let raf = 0
    let prev = performance.now()
    let published = prev
    const frames: number[] = []

    const tick = (now: number) => {
      const dt = now - prev
      prev = now
      // пропуски кадров при возврате во вкладку не портят среднее
      if (dt > 0 && dt < 500) {
        frames.push(dt)
        if (frames.length > 30) frames.shift()
      }
      if (now - published >= 500 && frames.length >= 5) {
        published = now
        const avg = frames.reduce((s, v) => s + v, 0) / frames.length
        setFps(Math.min(999, Math.round(1000 / avg)))
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return fps
}

const fpsTone = (v: number) => (v > 50 ? 'var(--ok)' : v >= 30 ? 'var(--warn)' : 'var(--danger)')

// ── позиция активного юнита с учётом перетаскивания ─────────────────────────

function activePos(s: AppState): Vec2 | null {
  const id = s.sel.units[0]
  if (!id) return null
  const live = s.drag?.live[id]
  if (live) return live.pos
  return s.project.units.find((u) => u.id === id)?.pos ?? null
}

/** Высота установки активного юнита, мм — во время драга берём живую */
function activeElevation(s: AppState): number {
  const id = s.sel.units[0]
  if (!id) return 0
  const live = s.drag?.live[id]
  if (live) return live.elevation
  const u = s.project.units.find((x) => x.id === id)
  return u ? elevationOf(u) : 0
}

// ── мелочи разметки ─────────────────────────────────────────────────────────

function Sep() {
  return <span aria-hidden className="h-[11px] w-px shrink-0" style={{ background: 'var(--border)' }} />
}

// ────────────────────────────────────────────────────────────────────────────

export function StatusBar() {
  const selCount = useAppStore((s) => s.sel.units.length)
  const active = useAppStore((s) => s.project.units.find((u) => u.id === s.sel.units[0]))
  const posX = useAppStore((s) => activePos(s)?.x ?? null)
  const posZ = useAppStore((s) => activePos(s)?.z ?? null)
  const elev = useAppStore(activeElevation)

  const dragging = useAppStore((s) => s.drag !== null)
  const candidate = useAppStore((s) => s.drag?.candidate?.label ?? null)
  const colliding = useAppStore((s) => s.drag?.colliding.length ?? 0)

  const units = useAppStore((s) => s.project.units)
  // смета — не срочная работа: не блокируем ввод во время правок
  const deferredUnits = useDeferredValue(units)
  // скрытые стеллажи в смету не идут — так же считают нижняя панель и раскрой.
  // Строка состояния живёт вне ErrorBoundary, поэтому сбой расчёта её не роняет.
  const bom = useMemo(() => {
    try {
      return computeBom(deferredUnits.filter((u) => !u.hidden))
    } catch {
      return null
    }
  }, [deferredUnits])

  const size = useMemo(() => (active ? outerSize(active.frame) : null), [active])
  const fps = useFps()

  return (
    <div
      className="flex h-[22px] w-full shrink-0 items-center gap-2 overflow-hidden px-2.5 text-[11px] select-none"
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        color: 'var(--text-dim)',
      }}
    >
      {/* ── слева: выбор, габарит, позиция ── */}
      <div className="flex min-w-0 shrink items-center gap-2 overflow-hidden">
        <span className="flex shrink-0 items-center gap-1.5 truncate">
          <Boxes size={13} strokeWidth={1.75} style={{ color: 'var(--text-faint)' }} />
          {selCount > 0 ? (
            <>
              {t('Выбрано:')}&nbsp;<span className="num">{selCount}</span>
            </>
          ) : (
            t('Ничего не выбрано')
          )}
        </span>

        {size && (
          <>
            <Sep />
            <Tooltip content={t('Габарит: ширина × высота × глубина, мм')} side="top">
              <span className="flex shrink-0 items-center gap-1.5">
                <Ruler size={13} strokeWidth={1.75} style={{ color: 'var(--text-faint)' }} />
                <span className="num" style={{ color: 'var(--text)' }}>
                  {fmtDims(size.x, size.y, size.z)}
                </span>
              </span>
            </Tooltip>
          </>
        )}

        {posX !== null && posZ !== null && (
          <>
            <Sep />
            <Tooltip content={t('Позиция центра пятна застройки, мм')} side="top">
              <span className="flex shrink-0 items-center gap-1.5">
                <span style={{ color: 'var(--text-faint)' }}>X</span>
                <span className="num" style={{ color: 'var(--text)' }}>
                  {fmtNum(Math.round(posX))}
                </span>
                <span style={{ color: 'var(--text-faint)' }}>Z</span>
                <span className="num" style={{ color: 'var(--text)' }}>
                  {fmtNum(Math.round(posZ))}
                </span>
              </span>
            </Tooltip>
          </>
        )}

        {/* высота установки — только когда секция реально поднята: на полу
            строка состояния и без этого перегружена */}
        {elev > 0 && (
          <>
            <Sep />
            <Tooltip content={t('Высота установки: от пола до низа секции, мм')} side="top">
              <span className="flex shrink-0 items-center gap-1.5">
                <Layers size={13} strokeWidth={1.75} style={{ color: 'var(--text-faint)' }} />
                <span className="num" style={{ color: 'var(--text)' }}>
                  {t('выс. {v} мм', { v: fmtNum(Math.round(elev)) })}
                </span>
              </span>
            </Tooltip>
          </>
        )}
      </div>

      {/* ── центр: что происходит при перетаскивании ── */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        {dragging && candidate && (
          <span className="anim-in flex min-w-0 items-center gap-1.5" style={{ color: 'var(--magnet)' }}>
            <Magnet size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{t(candidate)}</span>
          </span>
        )}
        {dragging && colliding > 0 && (
          <span className="anim-in flex shrink-0 items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <TriangleAlert size={13} strokeWidth={1.75} />
            {t('Пересечение!')}
          </span>
        )}
      </div>

      {/* ── справа: итоги и FPS ── */}
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip content={t('Деталей в проекте')} side="top">
          <span className="flex items-center gap-1.5">
            <span className="num" style={{ color: 'var(--text)' }}>
              {bom ? fmtNum(bom.totals.parts) : '—'}
            </span>
            {t('дет.')}
          </span>
        </Tooltip>

        <Sep />

        <Tooltip content={t('Материалы, кромка и фурнитура')} side="top">
          <span className="flex items-center gap-1.5">
            <Wallet size={13} strokeWidth={1.75} style={{ color: 'var(--text-faint)' }} />
            <span className="num" style={{ color: bom ? 'var(--text)' : 'var(--danger)' }}>
              {bom ? money(bom.totals.price) : t('ошибка')}
            </span>
          </span>
        </Tooltip>

        <Sep />

        <Tooltip content={t('Частота кадров сцены')} side="top">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: fpsTone(fps) }}
            />
            <span className="num" style={{ color: fpsTone(fps) }}>
              {fps}
            </span>
            {t('fps')}
          </span>
        </Tooltip>
      </div>
    </div>
  )
}
