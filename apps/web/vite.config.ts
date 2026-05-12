import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // 指向本地 SDK 源码，包含完整的 useIFrameMessage 实现
      '@unseal-network/game-sdk': path.resolve(
        __dirname,
        '../../../games/packages/sdk/src/index.ts'
      ),
    },
  },
})
