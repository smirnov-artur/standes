/**
 * Форматирование чисел под локаль сборки.
 *
 * Раньше типографика была прибита к русской: десятичная запятая и неразрывный
 * пробел в разрядах. Теперь и разделитель разрядов, и десятичный знак берёт
 * Intl.NumberFormat(INTL_LOCALE) — русская сборка даёт «1 240,5», английская
 * «1,240.5». Единицы измерения идут через t(), поэтому «мм» становится «mm».
 *
 * Деньги здесь НЕ форматируются: fmtMoney — тонкая обёртка над money() из
 * '@/i18n/currency', единственного места, где живёт валюта. Курса больше нет:
 * на вход приходит число, уже выраженное в валюте сборки.
 */

import { INTL_LOCALE, t } from '@/i18n'
import { money } from '@/i18n/currency'

/** неразрывный пробел — отбивка единицы измерения от числа */
const NBSP = ' '
/** типографский минус */
const MINUS = '−'

/** Форматтеры дороги в создании — держим по одному на (знаки, разряды) */
const CACHE = new Map<string, Intl.NumberFormat>()

function formatter(decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${decimals}|${grouping ? 1 : 0}`
  let f = CACHE.get(key)
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    })
    CACHE.set(key, f)
  }
  return f
}

/**
 * Базовое число: фиксированное число знаков после запятой, разряды — по локали.
 * Третий аргумент оставлен ради совместимости с прежними вызовами: пустая
 * строка по-прежнему означает «без разделителя разрядов», любое другое
 * значение — разделитель самой локали.
 */
export function fmtNum(v: number, decimals = 0, sep?: string): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const body = formatter(decimals, sep !== '').format(abs)
  // «−0» не показываем
  return v < 0 && Number(abs.toFixed(decimals)) !== 0 ? MINUS + body : body
}

/** «12 400 ₽» / «$135» — v уже в валюте сборки, валюта живёт в '@/i18n/currency' */
export function fmtMoney(v: number): string {
  return money(v)
}

/** «12,4 кг» / «860 г» — граммы ниже килограмма, сотни килограммов без дробей */
export function fmtMass(kg: number): string {
  if (!Number.isFinite(kg)) return '—'
  const g = Math.round(kg * 1000)
  if (Math.abs(g) < 1000) return `${fmtNum(g, 0)}${NBSP}${t('г')}`
  const abs = Math.abs(kg)
  return `${fmtNum(kg, abs < 100 ? 1 : 0)}${NBSP}${t('кг')}`
}

/** «1 240 мм» — всегда миллиметры, дробная часть только если она есть */
export function fmtLen(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const decimals = Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1
  return `${fmtNum(v, decimals)}${NBSP}${t('мм')}`
}

/** «2,84 м²» / «2.84 m²» */
export function fmtArea(m2: number): string {
  if (!Number.isFinite(m2)) return '—'
  return `${fmtNum(m2, 2)}${NBSP}${t('м²')}`
}

/** Одно измерение внутри строки габаритов: без разрядов, без единиц */
function dim(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return fmtNum(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1, '')
}

/** «1000 × 400 × 18» — толщина необязательна */
export function fmtDims(w: number, h: number, t?: number): string {
  const parts = [dim(w), dim(h)]
  if (t !== undefined) parts.push(dim(t))
  return parts.join(`${NBSP}×${NBSP}`)
}

/**
 * «87 %» / «87%» — на вход доля 0..1, а не проценты.
 * Отбивку знака процента ставит сама локаль: русская отделяет его неразрывным
 * пробелом, английская пишет вплотную.
 */
const PERCENT_CACHE = new Map<number, Intl.NumberFormat>()

export function fmtPercent(v: number, decimals = 0): string {
  if (!Number.isFinite(v)) return '—'
  let f = PERCENT_CACHE.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    PERCENT_CACHE.set(decimals, f)
  }
  const abs = Math.abs(v)
  const body = f.format(abs)
  return v < 0 && Number((abs * 100).toFixed(decimals)) !== 0 ? MINUS + body : body
}
