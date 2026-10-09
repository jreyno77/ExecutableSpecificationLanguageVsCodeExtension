import { defineConfig } from 'vite';

// Build after the native host: this ESM entry preserves the SDK's import-only
// public export and resolves its pristine packaged runtime from node_modules.
export default defineConfig({
  resolve: { conditions: ['node'] },
  ssr: { noExternal: true, external: ['executable-specification-language'] },
  build: {
    ssr: true, target: 'node24', outDir: 'dist/native', emptyOutDir: false,
    lib: { entry: 'src/core/generation-worker.ts', formats: ['es'], fileName: () => 'generation-worker.mjs' },
    rolldownOptions: { platform: 'node', external: ['executable-specification-language'], output: { entryFileNames: 'generation-worker.mjs' } },
  },
});
