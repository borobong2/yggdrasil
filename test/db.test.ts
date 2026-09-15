import { expect, it } from 'vitest';
import { getDb } from '../src/server/db.js';

it('reuses one database client per process', () => {
  expect(getDb()).toBe(getDb());
});
