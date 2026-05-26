import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROMO_PREVIEW_PATH = '/banco/promo-cobrancas-preview.html'
const PROMO_PREVIEW_FILE = path.resolve(__dirname, 'public/banco/promo-cobrancas-preview.html')

function promoPreviewDevPlugin() {
  return {
    name: 'promo-preview-dev',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0]
          if (url !== PROMO_PREVIEW_PATH) {
            next()
            return
          }
          if (!fs.existsSync(PROMO_PREVIEW_FILE)) {
            res.statusCode = 404
            res.end('promo-cobrancas-preview.html not found')
            return
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(fs.readFileSync(PROMO_PREVIEW_FILE, 'utf-8'))
        })
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), promoPreviewDevPlugin()],
  server: {
    port: 5173,
    host: true,
    open: true,
    proxy: {
      '/api': {
        target: 'https://aggibank-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
})
