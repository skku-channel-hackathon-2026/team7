import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devFunctionProxy } from './dev/functionProxy'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [react(), devFunctionProxy()],
  build: {
    outDir: './dist',
  },
})
