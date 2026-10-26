import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { assertTestDatabase, databaseName } from './test-db-target.mjs';

try {
  if (!process.env.DATABASE_URL) {
    const saved = JSON.parse(readFileSync('.local/test-db.json', 'utf8'));
    if (new URL(saved.url).pathname !== `/${databaseName}`) throw new Error('DB belongs to another worktree');
    process.env.DATABASE_URL = saved.url;
  }
  assertTestDatabase(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1 FROM issues LIMIT 0');
  } finally { await client.end(); }
} catch {
  console.error('Test DB is missing, unsafe, unavailable or not migrated. Run npm run test:db in this worktree. See README "Run tests".');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
