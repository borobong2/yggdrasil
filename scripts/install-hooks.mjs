import { spawnSync } from 'node:child_process';
import husky from 'husky';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot configure worktree hooks. See README.');
  return result.stdout.trim();
}
if (process.env.HUSKY !== '0' && spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0) {
  // Enabling worktreeConfig is shared, but preserves siblings' existing hooksPath.
  if (spawnSync('git', ['config', '--local', '--get', 'core.worktree'], { stdio: 'ignore' }).status === 0
    || git('rev-parse', '--is-bare-repository') === 'true') throw new Error('Nonstandard worktree config: install hooks manually. See README.');
  git('config', '--local', 'extensions.worktreeConfig', 'true');
  const config = git('rev-parse', '--path-format=absolute', '--git-path', 'config.worktree');
  // Husky normally writes the shared config. Redirect that write to this worktree.
  process.env.GIT_CONFIG = config;
  const error = husky();
  if (error) throw new Error(error);
}
