import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 4000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3010',
        ws: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
});
