import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // FFmpeg / pdf.js / SheetJS are all lazy-loaded from the app code
    // (dynamic import), so they land in separate chunks and stay out of
    // the initial bundle.
    chunkSizeWarningLimit: 1200,
  },
});
