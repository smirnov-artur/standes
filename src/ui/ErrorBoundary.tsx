import { Component, type ErrorInfo, type ReactNode } from 'react'

import { t } from '@/i18n'

interface Props {
  children: ReactNode
  /** имя области — попадёт в сообщение */
  area: string
  /** компактный режим для узких панелей */
  compact?: boolean
}

interface State {
  error: Error | null
}

/**
 * Изоляция сбоев: падение одной панели не должно ронять всё приложение.
 * Особенно важно для 3D — ошибка в шейдере или в геометрии не должна уносить UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[STANDES/${this.props.area}]`, error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center"
        style={{ background: 'var(--bg-panel)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--danger)' }}>
          <path
            d="M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.2A1.8 1.8 0 004.2 20h15.6a1.8 1.8 0 001.6-2.8L13.7 3.9a1.9 1.9 0 00-3.4 0z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
          {t('Сбой: {area}', { area: t(this.props.area) })}
        </div>
        {!this.props.compact && (
          <div className="max-w-[320px] text-[11px] leading-snug break-words" style={{ color: 'var(--text-faint)' }}>
            {error.message}
          </div>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="focus-ring mt-1 h-6 rounded-md px-2.5 text-[11.5px]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          {t('Попробовать снова')}
        </button>
      </div>
    )
  }
}
