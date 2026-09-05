import { Hono } from 'hono';
import { registerHealthRoute } from './routes/health.js';

export const app = new Hono();

registerHealthRoute(app);
