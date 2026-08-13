/**
 * Оболочка клиентского режима: шапка сверху, сцена во весь остаток,
 * узкая панель параметров справа. Ни списка юнитов, ни сметы, ни статус-бара —
 * покупателю нужен зал, а не рабочее место.
 *
 * Сцену рендерит App и передаёт сюда children — так один и тот же <Viewport/>
 * переиспользуется обоими режимами без перемонтирования логики сцены.
 *
 * Узкий экран (<900px): панель уезжает вниз листом на 45vh.
 */

import type { ReactNode } from 'react'

import { t } from '@/i18n'
import { ErrorBoundary } from '@/ui/ErrorBoundary'

import { ClientConfigurator } from './Configurator'
import { ClientRoom } from '@/ui/client/Room'
import { ClientTopbar } from './Topbar'

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <ErrorBoundary area={t('Шапка')} compact>
        <ClientTopbar />
      </ErrorBoundary>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col min-[900px]:flex-row">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>

        <aside
          className="flex h-[45vh] w-full shrink-0 flex-col border-t min-[900px]:h-auto min-[900px]:w-[340px] min-[900px]:border-t-0 min-[900px]:border-l"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-panel)' }}
        >
          <ErrorBoundary area={t('Настройка секции')} compact>
            <ClientConfigurator />
          </ErrorBoundary>

          {/* зал — то, что покупатель задаёт первым: секции расставляются в него */}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <ErrorBoundary area={t('Торговый зал')} compact>
              <ClientRoom />
            </ErrorBoundary>
          </div>
        </aside>
      </div>
    </div>
  )
}
