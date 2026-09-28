// Local-only deterministic browser fixture; never imported by production.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg10');
process.env.YGGDRASIL_DEV_OWNER_ID = '00000000-0000-4000-8000-000000000010';
installTestOwner('yg10-browser-other', { id: '00000000-0000-4000-8000-000000000011' });
const app = createApp(undefined, async () => ({
  output: { design: { title: 'Browser activity plan', body: 'Review this deterministic local proposal.' }, lanes: { fe: ['Timeline UI'], be: ['Timeline API'], docs: ['Timeline guide'] } },
  model: { provider: 'test', name: 'browser-fixture' }
}));
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3010 });
