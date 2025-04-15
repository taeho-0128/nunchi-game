import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: "/",  // ✅ 꼭 넣어야 Vercel 배포 정상 작동
})