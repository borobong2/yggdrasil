import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Route tests share a local database; keep snapshots free of concurrent test writes.
  // Other agents' worktrees live under .worktrees/ — never pick up their tests.
  test: {
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
    exclude: [...configDefaults.exclude, '.worktrees/**', 'dist/**']
  }
});
