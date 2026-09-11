import type { Hono } from 'hono';
import type { AppEnv } from '../auth.js';
import { AIConfigurationRequired, generateOpenAISuggestion, type SuggestionProvider } from '../openai.js';
import { findCapture, generateSuggestion, listSuggestions } from '../suggestions.js';

export function registerSuggestionRoutes(app: Hono<AppEnv>, provider: SuggestionProvider = generateOpenAISuggestion): void {
  // Authentication is installed on /api/captures/* by registerCaptureRoutes.
  app.on(['GET', 'POST'], '/api/captures/:id/suggestions', async (context) => {
    const id = context.req.param('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return context.json({ error: 'Invalid capture ID' }, 400);
    }
    const ownerId = context.get('user').id;
    const capture = await findCapture(ownerId, id);
    if (!capture) return context.json({ error: 'Capture not found' }, 404);
    if (context.req.method === 'GET') return context.json(await listSuggestions(ownerId, id));
    try {
      return context.json(await generateSuggestion(ownerId, capture, provider), 201);
    } catch (error) {
      if (error instanceof AIConfigurationRequired) {
        return context.json({ error: 'AI configuration required: set OPENAI_API_KEY on the server.' }, 503);
      }
      return context.json({ error: 'Suggestion generation failed. Please try again.' }, 502);
    }
  });
}
