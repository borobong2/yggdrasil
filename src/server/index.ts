import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.js';

app.use('*', serveStatic({ root: './dist/client' }));

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
