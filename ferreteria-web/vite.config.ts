import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, las llamadas a /api se proxyan al backend NestJS (puerto 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
