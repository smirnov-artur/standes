import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Две независимые сборки из одного исходника:
 *   npm run dev      / npm run build      → русская версия, рубли    → dist/
 *   npm run dev:en   / npm run build:en   → английская версия, $     → dist-en/
 * Переключателя языка внутри приложения нет — это два разных сайта.
 *
 * Язык прокидывается СОБСТВЕННЫМИ глобальными константами, а не через
 * import.meta.env.VITE_*: Vite собирает import.meta.env из .env-файлов по
 * своим правилам и подставляет его раньше пользовательского define, из-за
 * чего переменная из окружения (cross-env) до рантайма не доезжала —
 * английская сборка молча выходила русской.
 */
/**
 * Шапка документа под локаль.
 *
 * Заголовок и описание приложение выставляет и в рантайме, но статический HTML
 * читают те, кто JS не исполняет: превью ссылки в мессенджере, поисковый робот,
 * читалка с экрана. До этого английская сборка отдавала `lang="ru"` и русский
 * <title> — в браузере всё выглядело правильно, а отправленная ссылка
 * разворачивалась по-русски.
 */
const HEAD = {
  ru: {
    lang: 'ru',
    title: 'STANDES — 3D-конфигуратор торговых стеллажей',
    description:
      'Расставьте стеллажи по своему залу в 3D: секции примагничиваются друг к другу, ' +
      'а спецификация, масса, раскрой и цена считаются на лету.',
    ogLocale: 'ru_RU',
    url: 'https://smirnov-artur.github.io/standes/',
  },
  en: {
    lang: 'en',
    title: 'STANDES — 3D retail shelving configurator',
    description:
      'Lay out shelving across your own floor in 3D: bays snap to each other while the ' +
      'bill of materials, mass, cutting plan and price are computed as you build.',
    ogLocale: 'en_US',
    url: 'https://smirnov-artur.github.io/standes/en/',
  },
} as const

function localeHead(locale: 'ru' | 'en') {
  const h = HEAD[locale]
  const preview = `${h.url.replace(/\/$/, '')}/preview.jpg`
  return {
    name: 'standes-locale-head',
    transformIndexHtml(html: string) {
      const tags = [
        `<meta name="description" content="${h.description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="STANDES" />`,
        `<meta property="og:locale" content="${h.ogLocale}" />`,
        `<meta property="og:title" content="${h.title}" />`,
        `<meta property="og:description" content="${h.description}" />`,
        `<meta property="og:url" content="${h.url}" />`,
        `<meta property="og:image" content="${preview}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        // вторая версия — не перевод-переключатель, а отдельный сайт: сообщаем
        // об этом поисковику явно, иначе они конкурируют друг с другом
        `<link rel="alternate" hreflang="ru" href="${HEAD.ru.url}" />`,
        `<link rel="alternate" hreflang="en" href="${HEAD.en.url}" />`,
      ].join('\n    ')

      return html
        .replace('<html lang="ru"', `<html lang="${h.lang}"`)
        .replace(/<title>[^<]*<\/title>/, `<title>${h.title}</title>`)
        .replace('</head>', `  ${tags}\n  </head>`)
    },
  }
}

export default defineConfig(() => {
  const locale = (process.env.VITE_LOCALE ?? 'ru').toLowerCase() === 'en' ? 'en' : 'ru'
  const isEn = locale === 'en'
  const currency = (process.env.VITE_CURRENCY ?? '').toUpperCase()
  /*
   * База URL. По умолчанию '/' — так работает локальный запуск.
   * На GitHub Pages сайт лежит в подпапке (/standes/, /standes/en/),
   * и без этого все ссылки на ассеты уедут в корень домена и дадут 404.
   */
  const base = process.env.VITE_BASE ?? '/'

  return {
    base,
    plugins: [react(), tailwindcss(), localeHead(locale)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __STANDES_LOCALE__: JSON.stringify(locale),
      __STANDES_CURRENCY__: JSON.stringify(currency),
    },
    server: { port: isEn ? 5174 : 5173, host: true },
    build: {
      outDir: isEn ? 'dist-en' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 2000,
    },
  }
})
