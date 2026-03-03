import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true, // Разрешить доступ извне контейнера
    port: 5173, // Порт
    strictPort: true,
    watch: {
      usePolling: true, // Принудительно проверять изменения файлов
    },
  },
})