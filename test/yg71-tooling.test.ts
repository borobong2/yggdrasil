import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('fails closed with actionable guidance and never prints a supplied connection secret', () => {
  const runner = resolve('scripts/test.mjs');
  const directory = mkdtempSync(`${tmpdir()}/yg71-no-db-`);
  try {
    for (const url of ['', 'postgres://user:do-not-print@project.supabase.co/yggdrasil_test_yg71', 'postgres://user:do-not-print@127.0.0.1:1/yggdrasil_test_yg71']) {
      const result = spawnSync(process.execPath, [runner], { cwd: directory, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('npm run test:db');
      expect(result.stderr).not.toContain('do-not-print');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('installs Husky into a worktree config without writing a shared hooksPath', () => {
  const installer = resolve('scripts/install-hooks.mjs');
  const directory = mkdtempSync(`${tmpdir()}/yg71-hooks-`);
  // Git hooks export repository variables; a fixture must never inherit that repository.
  const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (...args: string[]) => spawnSync('git', args, { cwd: directory, env: fixtureEnv, encoding: 'utf8' });
  try {
    expect(git('init', '-q').status).toBe(0);
    const result = spawnSync(process.execPath, [installer], { cwd: directory, env: { ...fixtureEnv, HUSKY: '1' }, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(git('config', '--local', '--get', 'core.hooksPath').status).toBe(1);
    expect(git('config', '--worktree', '--get', 'core.hooksPath').stdout.trim()).toBe('.husky/_');
    expect(git('config', '--local', '--get', 'extensions.worktreeConfig').stdout.trim()).toBe('true');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
