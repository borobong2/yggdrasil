import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Route tests share a local database; keep snapshots free of concurrent test writes.
  test: { fileParallelism: false, setupFiles: ['./test/setup.ts'] }
});
