import { installTestOwner } from '../src/server/auth.js';

// Tests TRUNCATE/insert freely, so they must only ever touch a throwaway database.
// See README "Run tests": create a dedicated DB and export DATABASE_URL.
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('Tests need DATABASE_URL pointing at a dedicated test DB (e.g. …:54330/yggdrasil_test). See README "Run tests".');
const url = new URL(raw);
if (/(^|\.)supabase\.co$|(^|\.)pooler\.supabase\.com$/i.test(url.hostname)) {
  throw new Error(`Refusing to run tests against Supabase host ${url.hostname}. Use a local dedicated test DB.`);
}
if (decodeURIComponent(url.pathname.slice(1)) === 'yggdrasil') {
  throw new Error('Refusing to run tests against the live local database "yggdrasil". Use a dedicated DB such as yggdrasil_test.');
}

installTestOwner('test-owner-token', { id: '00000000-0000-4000-8000-000000000001' });
installTestOwner('test-owner-two-token', { id: '00000000-0000-4000-8000-000000000002' });
