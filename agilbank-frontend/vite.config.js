import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_BANCO_DIR = path.resolve(__dirname, 'public/banco')

/** Garante HTML em public/banco/*.html (evita 404 quando a porta 5173 é outro processo). */
function bancoPreviewDevPlugin() {
  return {
    name: 'banco-preview-dev',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] ?? ''
          if (!url.startsWith('/banco/') || !url.endsWith('.html')) {
            next()
            return
          }
          const file = path.join(PUBLIC_BANCO_DIR, path.basename(url))
          if (!file.startsWith(PUBLIC_BANCO_DIR) || !fs.existsSync(file)) {
            next()
            return
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(fs.readFileSync(file, 'utf-8'))
        })
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), bancoPreviewDevPlugin()],
  server: {
    // 5173 costuma ser usada pelo preview do Cursor — AgilBank usa 5180
    port: 5180,
    strictPort: true,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'https://aggibank-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    port: 5180,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
})
