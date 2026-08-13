import { useAppStore } from '@/store/useStore'
import { t } from '@/i18n'
import { Section } from '@/ui/controls'
import { INTL_LOCALE } from '@/i18n'

/**
 * Размеры торгового зала в клиентском режиме.
 *
 * В режиме менеджера комната живёт в инспекторе, за иконкой домика — до неё
 * ещё надо додуматься. Покупателю, который расставляет секции по своему залу,
 * это первое, что нужно задать, поэтому здесь блок стоит на виду и работает
 * площадью: люди держат в голове «сотка», а не «7 200 на 5 400».
 */

/** Типовые площади торгового зала, м² */
const AREAS = [20, 50, 100, 200, 400]

/** Пропорция зала: чуть вытянутый прямоугольник читается как торговый зал */
const RATIO = 4 / 3

function sizeForArea(area: number): { width: number; depth: number } {
  const depth = Math.sqrt((area * 1e6) / RATIO)
  return {
    width: Math.round((depth * RATIO) / 100) * 100,
    depth: Math.round(depth / 100) * 100,
  }
}

const fmt = (mm: number) => new Intl.NumberFormat(INTL_LOCALE).format(Math.round(mm))

export function ClientRoom() {
  const width = useAppStore((s) => s.project.room.width)
  const depth = useAppStore((s) => s.project.room.depth)
  const updateRoom = useAppStore((s) => s.updateRoom)
  const mode = useAppStore((s) => s.view.mode)
  const setView = useAppStore((s) => s.setView)

  const area = (width * depth) / 1e6
  const nearest = AREAS.reduce((a, b) => (Math.abs(b - area) < Math.abs(a - area) ? b : a))
  const snapped = Math.abs(nearest - area) / nearest < 0.06 ? nearest : null

  return (
    <Section title={t('Торговый зал')} defaultOpen>
      <div className="flex flex-col gap-2 px-3 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map((a) => {
            const on = snapped === a
            return (
              <button
                key={a}
                type="button"
                onClick={() => updateRoom(sizeForArea(a))}
                className="focus-ring h-[30px] rounded-md px-2.5 text-[12px] font-medium transition-colors"
                style={{
                  background: on ? 'var(--accent)' : 'var(--bg-input)',
                  color: on ? 'var(--accent-ink)' : 'var(--text)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {a} {t('м²')}
              </button>
            )
          })}
        </div>

        <div className="num text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          {fmt(width)} × {fmt(depth)} {t('мм')} · {area.toFixed(area < 100 ? 1 : 0)} {t('м²')}
        </div>

        {mode !== 'plan' && (
          <button
            type="button"
            onClick={() => setView({ mode: 'plan' })}
            className="focus-ring h-[30px] rounded-md text-[12px] transition-colors"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
            }}
          >
            {t('Открыть план и тянуть стены')}
          </button>
        )}
        {mode === 'plan' && (
          <div className="text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
            {t('Потяните стену мышью, чтобы изменить размер зала')}
          </div>
        )}
      </div>
    </Section>
  )
}
