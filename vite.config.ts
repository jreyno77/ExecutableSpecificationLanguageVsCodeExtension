import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        core: 'src/core/WorkspaceCore.ts',
        ui: 'src/ui/OutputTabs.ts',
        vscode: 'src/vscode/EditorAdapter.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'vscode'] },
  },
});
