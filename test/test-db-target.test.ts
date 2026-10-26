import { expect, it } from 'vitest';
// @ts-expect-error node script deliberately has no TS build step
import { assertTestDatabase } from '../scripts/test-db-target.mjs';
it('accepts only explicitly named local disposable test databases', () => {
  expect(assertTestDatabase('postgres://user:pass@127.0.0.1:55471/yggdrasil_test_yg71')).toContain('yggdrasil_test_yg71');
  for (const value of [undefined, 'postgres://x@localhost/yggdrasil', 'postgres://x@localhost/postgres', 'postgres://x@db.example/yggdrasil_test_yg71', 'postgres://x@project.supabase.co/yggdrasil_test_yg71', 'https://localhost/yggdrasil_test_yg71']) {
    expect(() => assertTestDatabase(value)).toThrow();
  }
});
