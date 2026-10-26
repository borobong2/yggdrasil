import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { databaseName } from './test-db-target.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(command === 'npm' ? 'Test DB migration failed. Check drizzle migrations and retry npm run test:db; no database was removed.' : 'Docker failed. Check Docker is running; existing containers are never removed.');
  return result.stdout?.trim();
}
try {
  const name = databaseName.replaceAll('_', '-');
  const exists = spawnSync('docker', ['container', 'inspect', name], { stdio: 'ignore' }).status === 0;
  if (!exists) run('docker', ['run', '--name', name, '--label', `yggdrasil.test-worktree=${process.cwd()}`, '-e', 'POSTGRES_USER=test', '-e', `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`, '-e', `POSTGRES_DB=${databaseName}`, '-p', '127.0.0.1::5432', '-d', 'postgres:16-alpine']);
  const info = JSON.parse(run('docker', ['inspect', name]))[0];
  if (info.Config.Labels?.['yggdrasil.test-worktree'] !== process.cwd()) throw new Error('Container belongs to another worktree; refusing reuse.');
  run('docker', ['start', name]);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'test', '-d', databaseName], { stdio: 'ignore' }).status === 0) break;
    if (attempt === 29) throw new Error('Dedicated test DB not ready. Inspect the test container logs.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const running = JSON.parse(run('docker', ['inspect', name]))[0];
  const port = running.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const password = info.Config.Env.find(value => value.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
  const url = `postgres://test:${password}@127.0.0.1:${port}/${databaseName}`;
  run('npm', ['run', 'db:migrate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  mkdirSync('.local', { recursive: true });
  writeFileSync('.local/test-db.json', JSON.stringify({ url, container: name }), { mode: 0o600 });
  console.log(`Dedicated migrated test DB ready: ${databaseName}. Credentials saved only in ignored .local/test-db.json.`);
} catch (error) { console.error(error.message); process.exit(1); }
