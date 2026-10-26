// Dedicated YG-63 test server; never use a live database.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
assert.equal(process.env.NODE_ENV, 'test');
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/yggdrasil_yg63');
process.env.YGGDRASIL_DEV_OWNER_ID = '00000000-0000-4000-8000-000000000063';
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3063 });
