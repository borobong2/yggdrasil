import { installTestOwner } from '../src/server/auth.js';

// Tests TRUNCATE/insert freely, so they must only ever touch a throwaway database.
// See README "Run tests": create a dedicated DB and export DATABASE_URL.
// @ts-expect-error shared Node script has no TS build step
import { assertTestDatabase } from '../scripts/test-db-target.mjs';
assertTestDatabase(process.env.DATABASE_URL);

installTestOwner('test-owner-token', { id: '00000000-0000-4000-8000-000000000001' });
installTestOwner('test-owner-two-token', { id: '00000000-0000-4000-8000-000000000002' });
