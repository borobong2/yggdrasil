import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';

const ownerOne = { authorization: 'Bearer test-owner-token' };
const ownerTwo = { authorization: 'Bearer test-owner-two-token' };

describe('capture routes', () => {
  it('creates a capture and returns it from the inbox', async () => {
    const create = await app.request('/api/captures', {
      method: 'POST',
      headers: { ...ownerOne, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'remember this' })
    });

    expect(create.status).toBe(201);
    expect((await create.json()).text).toBe('remember this');
  });

  it('lists captures newest first', async () => {
    for (const text of ['older capture', 'newer capture']) {
      await app.request('/api/captures', {
        method: 'POST',
        headers: { ...ownerOne, 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
    }

    const response = await app.request('/api/captures', { headers: ownerOne });
    expect(response.status).toBe(200);
    expect((await response.json()).slice(0, 2).map((capture: { text: string }) => capture.text)).toEqual([
      'newer capture',
      'older capture'
    ]);
  });

  it('rejects blank capture text', async () => {
    const response = await app.request('/api/captures', {
      method: 'POST',
      headers: { ...ownerOne, 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' })
    });

    expect(response.status).toBe(400);
  });

  it('does not expose another owner’s captures', async () => {
    await app.request('/api/captures', {
      method: 'POST',
      headers: { ...ownerTwo, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'private capture' })
    });

    const response = await app.request('/api/captures', { headers: ownerOne });
    expect((await response.json()).map((capture: { text: string }) => capture.text)).not.toContain('private capture');
  });
});
