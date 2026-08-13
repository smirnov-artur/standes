/**
 * Локализация. Язык и валюта выбираются НА СБОРКЕ, а не кнопкой в интерфейсе:
 *
 *   npm run dev        / npm run build      → русская версия, рубли   → dist/
 *   npm run dev:en     / npm run build:en   → английская версия, доллары → dist-en/
 *
 * Это два отдельных сайта на двух адресах из одного исходника. Переключателя
 * языка в UI нет и не должно быть — так просил заказчик.
 *
 * КЛЮЧ СЛОВАРЯ — САМА РУССКАЯ СТРОКА. Код изначально написан по-русски, поэтому
 * придумывать шестьсот идентификаторов вида `panel.units.title` смысла нет:
 * оборачиваем строку в t(), а перевод кладём в en.ts. Если перевода нет —
 * на экране останется русский текст, и это сразу видно.
 */

import { EN } from './en'

export type Locale = 'ru' | 'en'

const RAW_LOCALE = (typeof __STANDES_LOCALE__ === 'string' ? __STANDES_LOCALE__ : 'ru').toLowerCase()
export const LOCALE: Locale = RAW_LOCALE === 'en' ? 'en' : 'ru'
export const IS_EN = LOCALE === 'en'

/** Пропуски перевода, собранные за сессию — чтобы их было видно в консоли dev */
const missing = new Set<string>()

/**
 * Перевод строки. Подстановка — через фигурные скобки: t('Секций: {n}', { n: 3 }).
 * В русской сборке возвращает исходную строку без поиска по словарю.
 */
export function t(ru: string, params?: Record<string, string | number>): string {
  let out = ru
  if (IS_EN) {
    const hit = EN[ru]
    if (hit !== undefined) {
      out = hit
    } else if (import.meta.env.DEV && !missing.has(ru)) {
      missing.add(ru)
      console.warn(`[i18n] нет перевода: "${ru}"`)
    }
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v))
    }
  }
  return out
}

/** Список непереведённых строк — для отладки в дев-режиме */
export function missingTranslations(): string[] {
  return [...missing].sort()
}

// ────────────────────────────────────────────────────────────────────────────
//  Числа и даты
// ────────────────────────────────────────────────────────────────────────────

/** Локаль для Intl: русская пишет 1 234,5, английская 1,234.5 */
export const INTL_LOCALE = IS_EN ? 'en-US' : 'ru-RU'

/**
 * Русское склонение по числу: plural(n, 'секция', 'секции', 'секций').
 * В английской сборке достаточно двух форм — берём вторую как единственное
 * число и третью как множественное.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (IS_EN) return n === 1 ? t(one) : t(many)
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}
