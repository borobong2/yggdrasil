import { Hono } from 'hono';
import type { AppEnv } from './auth.js';
import type { SuggestionProvider } from './openai.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSuggestionRoutes } from './routes/suggestions.js';
import { registerWorkRoutes } from './routes/work.js';
import { registerPatRoutes } from './routes/pats.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerEvidenceRoutes } from './routes/evidence.js';
import { registerPlanningRoutes } from './routes/planning.js';
import { registerBoardRoutes } from './routes/board.js';

export function createApp(provider?: SuggestionProvider) {
  const app = new Hono<AppEnv>();
  registerHealthRoute(app);
  registerCaptureRoutes(app);
  registerSuggestionRoutes(app, provider);
  registerWorkRoutes(app);
  registerEvidenceRoutes(app);
  registerPatRoutes(app);
  registerDocumentRoutes(app);
  registerPlanningRoutes(app);
  registerBoardRoutes(app);
  return app;
}

export const app = createApp();
