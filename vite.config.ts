import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@systems': path.resolve(__dirname, './src/systems'),
      '@entities': path.resolve(__dirname, './src/entities'),
      '@levels': path.resolve(__dirname, './src/levels'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@babylonjs/core')) return 'babylon';
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
