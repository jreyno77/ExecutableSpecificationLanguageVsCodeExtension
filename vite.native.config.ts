import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { conditions: ['node'] },
  ssr: { noExternal: true, external: ['vscode'] },
  build: {
    ssr: true, target: 'node20', outDir: 'dist/native', emptyOutDir: true,
    lib: { entry: { extension: 'src/vscode/extension.ts', server: 'src/vscode/server.ts' }, formats: ['cjs'], fileName: (_format, name) => `${name}.cjs` },
    rolldownOptions: { platform: 'node', external: ['vscode'] },
  },
});
