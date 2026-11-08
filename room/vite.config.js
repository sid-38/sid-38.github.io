import { defineConfig } from 'vite';
import { bookContent } from './vite/bookContent.js';

export default defineConfig({
  plugins: [bookContent()],
  server: { open: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
});
