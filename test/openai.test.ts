import { afterEach, expect, it, vi } from 'vitest';
import { AIConfigurationRequired, generateOpenAISuggestion } from '../src/server/openai.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('does not contact OpenAI without a key', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(generateOpenAISuggestion('capture')).rejects.toBeInstanceOf(AIConfigurationRequired);
  expect(fetch).not.toHaveBeenCalled();
});

it('requests strict structured output and returns validated output with model metadata', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
  vi.stubEnv('OPENAI_MODEL', 'test-model');
  const output = { title: 'Garden', type: 'project', targetId: null };
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed', model: 'test-model-snapshot', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }));
  vi.stubGlobal('fetch', fetch);
  expect(await generateOpenAISuggestion('capture')).toEqual({ output, model: { provider: 'openai', name: 'test-model-snapshot' } });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/responses');
  const body = JSON.parse(request.body);
  expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true, schema: { additionalProperties: false } });
  expect(body.store).toBe(false);
  expect(body).not.toHaveProperty('tools');
});

it.each([
  { status: 'incomplete', output: [] },
  { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] },
  { status: 'completed', model: 'test', output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] },
  { status: 'completed', model: 'test', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"title":"Garden","type":"team","targetId":null}' }] }] }
])('rejects incomplete, refused, or malformed output: %j', async (result) => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
  await expect(generateOpenAISuggestion('capture')).rejects.toThrow();
});
