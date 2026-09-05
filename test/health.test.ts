import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';

describe('GET /api/health', () => {
  it('returns the health payload', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
