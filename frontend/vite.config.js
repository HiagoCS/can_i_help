import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from "vite-tsconfig-paths";

// Same-origin development proxy keeps API cookies available to the frontend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL || 'http://localhost:3000'

  return {
    plugins: [react(), svgr(), tsconfigPaths()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true, // ou use '0.0.0.0'
      port: 5173,  // porta padrão do Vite
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: apiTarget.startsWith('https://'),
          ws: true,
        },
        '/storage': {
          target: apiTarget,
          changeOrigin: true,
          secure: apiTarget.startsWith('https://'),
        },
      },
    },
    build: {
      minify: 'terser',
      terserOptions: {
        keep_fnames: true,
        keep_classnames: true
      }
    }
  }
})