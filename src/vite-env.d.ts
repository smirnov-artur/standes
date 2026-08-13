/// <reference types="vite/client" />

/**
 * Константы сборки, подставляются через define в vite.config.ts.
 * Через import.meta.env их прокидывать нельзя: Vite собирает его из .env-файлов
 * и подставляет раньше пользовательского define.
 */
declare const __STANDES_LOCALE__: string
/** 'RUB' | 'USD' | '' — пустая строка значит «по языку сборки» */
declare const __STANDES_CURRENCY__: string
/**
 * УСТАРЕЛО и НИГДЕ НЕ ЧИТАЕТСЯ: курса в проекте больше нет — рублёвый и
 * долларовый прайсы независимы (см. Price в '@/i18n/currency'). Объявление
 * оставлено только потому, что define ещё живёт в vite.config.ts; новый код
 * этой константой пользоваться не должен.
 */
