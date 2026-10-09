import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { packageRuntime } from './vite.runtime-packages.mjs';

export default defineConfig({
  resolve: { conditions: ['node'] },
  plugins: [{
    name: 'package-generation-runtime',
    async writeBundle() {
      const count = await packageRuntime(resolve('.'), resolve('dist/native'));
      this.info(`Packaged ${count} locked SDK runtime packages with their original resources.`);
    },
  }],
  ssr: { noExternal: true, external: ['vscode', '@d2lang/d2'] },
  build: {
    ssr: true, target: 'node20', outDir: 'dist/native', emptyOutDir: true,
    lib: { entry: { extension: 'src/vscode/extension.ts', server: 'src/vscode/server.ts' }, formats: ['cjs'], fileName: (_format, name) => `${name}.cjs` },
    rolldownOptions: { platform: 'node', external: ['vscode', '@d2lang/d2'] },
  },
});
