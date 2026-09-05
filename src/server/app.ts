import { Hono } from 'hono';
import type { AppEnv } from './auth.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { registerHealthRoute } from './routes/health.js';

export const app = new Hono<AppEnv>();

registerHealthRoute(app);
registerCaptureRoutes(app);
