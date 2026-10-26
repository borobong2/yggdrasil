import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Route tests share a local database; keep snapshots free of concurrent test writes.
  // Other agents' worktrees live under .worktrees/ — never pick up their tests.
  test: {
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'html', 'json', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 }
    },
    setupFiles: ['./test/setup.ts'],
    exclude: [...configDefaults.exclude, '.worktrees/**', 'dist/**']
  }
});
