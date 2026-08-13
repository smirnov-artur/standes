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
    plugins: [react(), tailwindcss()],
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
