import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The real renderer starts its worker and WASM relative to its own module.
// Keep that package boundary intact in the installed native artifact.
const require = createRequire(import.meta.url);
const sdkRoot = dirname(dirname(dirname(require.resolve('@d2lang/d2'))));

export default defineConfig({
  resolve: { conditions: ['node'] },
  plugins: [{
    name: 'package-uml-runtime',
    async writeBundle() {
      const target = resolve('dist/native/node_modules/@d2lang/d2');
      await fs.mkdir(target, { recursive: true });
      for (const file of ['package.json', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) await fs.copyFile(join(sdkRoot, file), join(target, file));
      await fs.cp(join(sdkRoot, 'dist/node-cjs'), join(target, 'dist/node-cjs'), { recursive: true });
    },
  }],
  ssr: { noExternal: true, external: ['vscode', '@d2lang/d2'] },
  build: {
    ssr: true, target: 'node20', outDir: 'dist/native', emptyOutDir: true,
    lib: { entry: { extension: 'src/vscode/extension.ts', server: 'src/vscode/server.ts' }, formats: ['cjs'], fileName: (_format, name) => `${name}.cjs` },
    rolldownOptions: { platform: 'node', external: ['vscode', '@d2lang/d2'] },
  },
});
