import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

export const databaseName = `yggdrasil_test_${createHash('sha256').update(realpathSync(process.cwd())).digest('hex').slice(0, 12)}`;
export function assertTestDatabase(raw) {
  if (!raw) throw new Error('Test DB missing. Run npm run test:db, or set DATABASE_URL to a dedicated localhost test DB.');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^yggdrasil_test_[a-z0-9_]+$/.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error('Refusing test DB: use localhost and a dedicated yggdrasil_test_<worktree> database. See README.');
  }
  return raw;
}
