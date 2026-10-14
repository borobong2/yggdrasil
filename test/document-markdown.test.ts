import { expect, it } from 'vitest';
import { mentionedIssueIds, mentionToken, parseMarkdown, serializeMarkdown, tableCells } from '../src/client/blocks.js';

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

// YG-48: GFM tables are one `table` block whose text is the table markdown (spacing normalized only).
const owner = '| 정답 | 계산 | 뜻 |\n|---|---|---|\n| 합격 (y = 1) | −log q | 합격에 준 확률을 봄 |\n| 불합격 (y = 0) | −log(1 − q) | 불합격에 준 확률을 봄 |';

it('parses the owner-reported table and round-trips it', () => {
  const doc = `# 손실\n\n${owner}\n\n끝`;
  const blocks = parseMarkdown(doc);
  expect(blocks.map((b) => b.type)).toEqual(['h1', 'table', 'p']);
  expect(tableCells(blocks[1]!.text)).toEqual({
    header: ['정답', '계산', '뜻'], align: [undefined, undefined, undefined],
    rows: [['합격 (y = 1)', '−log q', '합격에 준 확률을 봄'], ['불합격 (y = 0)', '−log(1 − q)', '불합격에 준 확률을 봄']]
  });
  expect(serializeMarkdown(blocks)).toBe(doc);
  expect(serializeMarkdown(parseMarkdown(serializeMarkdown(blocks)))).toBe(doc);
});

it('reads alignment, escaped pipes, missing outer pipes and inline code cells', () => {
  const table = tableCells('a | b | c | d\n:--- | :---: | ---: | ---\n`x \\| y` | **b** | [l](https://x.y) | 1\nonly one');
  expect(table).toEqual({ header: ['a', 'b', 'c', 'd'], align: ['left', 'center', 'right', undefined], rows: [['`x | y`', '**b**', '[l](https://x.y)', '1'], ['only one', '', '', '']] });
  expect(tableCells('| a | b |\n| --- |')).toBeNull(); // header/delimiter cell counts must match
  expect(tableCells('| a |\n| --- |\n| 1 | 2 |')!.rows).toEqual([['1']]); // extra cells drop, like GFM
});

it('splits tables from surrounding blocks and leaves non-tables alone', () => {
  const blocks = parseMarkdown('intro line\n| a | b |\n|:-:|--|\n| 1 | 2 |   \n- after');
  expect(blocks.map((b) => [b.type, b.text])).toEqual([['p', 'intro line'], ['table', '| a | b |\n|:-:|--|\n| 1 | 2 |'], ['bullet', 'after']]);
  expect(parseMarkdown('a | b\n---').map((b) => b.type)).toEqual(['p', 'divider']); // no pipe in delimiter → not a table
  expect(parseMarkdown('x | y is prose').map((b) => b.type)).toEqual(['p']);
  const edited = parseMarkdown('| a |\n| -- |\n| 1 |\n\n| 2 |'); // a stray pipe line after a blank stays a paragraph, nothing dropped
  expect(serializeMarkdown(edited)).toBe('| a |\n| -- |\n| 1 |\n\n| 2 |');
});
