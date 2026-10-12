import { expect, it } from 'vitest';
import { mentionedIssueIds, mentionToken, parseMarkdown, serializeMarkdown } from '../src/client/blocks.js';

const canonical = [
  '# Title', '## Section', '### Detail', 'Plain **bold** paragraph\nwith a soft break',
  '- one\n- two\n  - nested stays raw text', '1. first\n2. second', '- [ ] open\n- [x] done',
  '> quoted\n>\n> second', '> [!NOTE]\n> callout body', '```ts\nconst a = 1;\n\nreturn a;\n```', '---',
  '<details>\n<summary>More</summary>\n\nhidden line\n</details>', `See ${mentionToken('Ship it', '11111111-1111-4111-8111-111111111111')}`
].join('\n\n');

it('round-trips every supported block through markdown without loss', () => {
  const blocks = parseMarkdown(canonical);
  expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'h3', 'p', 'bullet', 'bullet', 'numbered', 'numbered', 'todo', 'todo', 'quote', 'callout', 'code', 'divider', 'toggle', 'p']);
  expect([blocks[8]!.checked, blocks[9]!.checked]).toEqual([false, true]);
  expect(blocks[12]).toMatchObject({ lang: 'ts', text: 'const a = 1;\n\nreturn a;' });
  expect(serializeMarkdown(blocks)).toBe(canonical);
  expect(serializeMarkdown(parseMarkdown(serializeMarkdown(blocks)))).toBe(canonical);
  expect(mentionedIssueIds(canonical)).toEqual(['11111111-1111-4111-8111-111111111111']);
});

it('keeps legacy plain-text bodies intact and documents the known normalizations', () => {
  expect(serializeMarkdown(parseMarkdown('Plain text'))).toBe('Plain text');
  expect(serializeMarkdown(parseMarkdown('a\nb\n\n\n\nc'))).toBe('a\nb\n\nc'); // extra blank lines collapse
  expect(serializeMarkdown(parseMarkdown('3. three\n4. four'))).toBe('1. three\n2. four'); // list start renumbers
  expect(serializeMarkdown(parseMarkdown('- a\n\n- b'))).toBe('- a\n- b'); // loose lists become tight
  expect(serializeMarkdown(parseMarkdown('```\nunclosed'))).toBe('```\nunclosed\n```');
});
