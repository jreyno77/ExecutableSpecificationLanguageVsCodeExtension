import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/{unit,acceptance}/**/*.test.{ts,tsx}'] },
});
