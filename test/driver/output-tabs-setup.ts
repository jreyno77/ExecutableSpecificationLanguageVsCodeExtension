import type { TestProject } from 'vitest/node';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

declare module 'vitest' {
  interface ProvidedContext { outputTabs: { url: string } }
}

export async function setup(project: TestProject) {
  const server = await createServer({ configFile: false, plugins: [react()],
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    optimizeDeps: { entries: ['test/resources/output-tabs.html'] } });
  try {
    await server.listen();
    await server.warmupRequest('/src/ui/OutputTabs.ts');
    project.provide('outputTabs', { url: server.resolvedUrls!.local[0]! });
    return () => server.close();
  } catch (error) {
    await server.close();
    throw error;
  }
}
