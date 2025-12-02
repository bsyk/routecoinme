import { defineConfig } from 'vite'
import { cloudflare } from "@cloudflare/vite-plugin";
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [cloudflare()],
  root: '.',
  base: '/',
  server: {
    port: 3000,
    open: true,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'index.html'),
            terms: resolve(__dirname, 'terms/index.html'),
            privacy: resolve(__dirname, 'privacy/index.html'),
          },
        },
      }
    }
  }
})
