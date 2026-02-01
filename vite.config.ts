import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500, // Set the limit to 1500 KiB (1.5 MB)
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
