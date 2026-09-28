import type { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AppEnv } from '../auth.js';
import type { DeliveryPlanProvider } from '../openai.js';
import { authenticatePat } from '../pats.js';
import { createMcpServer } from '../mcp.js';

export function registerMcpRoutes(app: Hono<AppEnv>, provider?: DeliveryPlanProvider): void {
  app.all('/mcp', async (context) => {
    const token = context.req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const owner = token ? await authenticatePat(token) : undefined;
    if (!owner) return context.json({ error: 'Unauthorized' }, 401);
    const origin = context.req.header('origin');
    if (origin) {
      const source = URL.canParse(origin) ? new URL(origin) : undefined;
      // TLS may terminate at the proxy; compare hosts (including ports), not schemes.
      if (!source || !['http:', 'https:'].includes(source.protocol) || source.origin !== origin || source.host !== new URL(context.req.url).host) {
        return context.json({ error: 'Forbidden origin' }, 403);
      }
    }
    // No sessions or shared owner state: authenticate every request, including tools/call.
    if (context.req.method !== 'POST') return context.json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    const server = createMcpServer(owner.id, provider);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      // JSON mode resolves only after the complete response body is materialized.
      return await transport.handleRequest(context.req.raw);
    } finally {
      await server.close();
    }
  });
}
