import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    port: 80,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      strict: false,
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'onnxruntime': ['onnxruntime-web']
        }
      }
    }
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
    plugins: []
  }
})