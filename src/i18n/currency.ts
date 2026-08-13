/**
 * Валюта сборки и цена позиции.
 *
 * РАНЬШЕ: каталог хранил цены в рублях, а долларовая сборка делила их на курс
 * (USD_RATE = 92). Это был рублёвый прайс в долларовой обёртке — у экспортного
 * рынка своя логистика, своя пошлина и своя маржа, и его цена не обязана быть
 * рублёвой, делённой на курс.
 *
 * ТЕПЕРЬ: два НЕЗАВИСИМЫХ прайса. Каждая позиция каталога хранит пару
 * `Price { rub, usd }`, а сборка просто ВЫБИРАЕТ свою колонку (priceOf).
 * Ни курса, ни конвертации в рантайме здесь больше нет и быть не должно:
 * долларовые числа правятся отдельно, вручную, под экспортный рынок.
 *
 * money() получает на вход число, УЖЕ пересчитанное в валюту сборки, —
 * его дело только форматирование.
 */

import { IS_EN, INTL_LOCALE } from './index'

export interface CurrencyConfig {
  code: 'RUB' | 'USD'
  /** символ для короткой записи */
  symbol: string
  /** знаков после запятой в итоговых суммах */
  decimals: number
  /** символ слева от числа (как $12) или справа (как 12 ₽) */
  prefix: boolean
}

export const RUB: CurrencyConfig = {
  code: 'RUB',
  symbol: '₽',
  decimals: 0,
  prefix: false,
}

export const USD: CurrencyConfig = {
  code: 'USD',
  symbol: '$',
  decimals: 0,
  prefix: true,
}

/**
 * Валюта сборки. Английская версия — доллары, русская — рубли.
 * Если нужны доллары и в русской версии, соберите с VITE_CURRENCY=USD.
 */
const FORCED = (typeof __STANDES_CURRENCY__ === 'string' ? __STANDES_CURRENCY__ : '').toUpperCase()
export const CURRENCY: CurrencyConfig =
  FORCED === 'USD' ? USD : FORCED === 'RUB' ? RUB : IS_EN ? USD : RUB

/**
 * Пара независимых прайсов одной позиции каталога.
 * `rub` и `usd` — два самостоятельных числа, а не одно, пересчитанное по курсу.
 */
export interface Price {
  rub: number
  usd: number
}

/**
 * Цена позиции в валюте сборки. Это ВЫБОР колонки, а не пересчёт:
 * единственное место, где решается, из какого прайса взять число.
 */
export function priceOf(p: Price): number {
  return CURRENCY.code === 'USD' ? p.usd : p.rub
}

/**
 * Итоговая сумма в валюте сборки. На вход — число, УЖЕ выраженное в этой
 * валюте (см. priceOf); никаких умножений здесь не происходит.
 * Доллары округляются до целых: точность «до цента» в смете на мебель
 * создаёт ложное ощущение окончательной цены.
 */
export function money(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const n = new Intl.NumberFormat(INTL_LOCALE, {
    minimumFractionDigits: CURRENCY.decimals,
    maximumFractionDigits: CURRENCY.decimals,
  }).format(v)
  return CURRENCY.prefix ? `${CURRENCY.symbol}${n}` : `${n} ${CURRENCY.symbol}`
}

/** Цена за единицу измерения: «1 350 ₽/м²» или «$15/m²». Вход — валюта сборки. */
export function moneyPer(v: number, unit: string): string {
  return `${money(v)}/${unit}`
}
