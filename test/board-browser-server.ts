// Local-only browser fixture for YG-22; never imported by production. A fresh dev owner per start keeps the board empty.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg22');
process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3022 }, () => console.log('yg22 board fixture on http://127.0.0.1:3022'));
