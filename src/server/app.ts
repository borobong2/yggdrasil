import { Hono } from 'hono';
import type { AppEnv } from './auth.js';
import type { SuggestionProvider } from './openai.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSuggestionRoutes } from './routes/suggestions.js';

export function createApp(provider?: SuggestionProvider) {
  const app = new Hono<AppEnv>();
  registerHealthRoute(app);
  registerCaptureRoutes(app);
  registerSuggestionRoutes(app, provider);
  return app;
}

export const app = createApp();
