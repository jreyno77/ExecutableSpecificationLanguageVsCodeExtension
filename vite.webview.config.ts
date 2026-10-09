import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist/webview', emptyOutDir: true, target: 'chrome120',
    lib: { entry: 'src/ui/preview-webview.ts', formats: ['iife'], name: 'ExpecPreview', fileName: () => 'preview.js', cssFileName: 'preview' },
  },
});
