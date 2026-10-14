// Markdown <-> flat block list for the document editor. The stored body stays plain markdown (MCP read_document).
// Conventions: callout = GitHub alert `> [!NOTE]`, toggle = `<details><summary>`; issue mention = `[@title](#issue-<id>)`.
// Table (YG-48) = GFM pipe table kept as its markdown text; tableCells() reads it for rendering.
// ponytail: blocks are flat (no nesting); indented sub-lists survive as raw text inside their parent item.
export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'code' | 'divider' | 'callout' | 'toggle' | 'table';
export type Block = { id: string; type: BlockType; text: string; checked?: boolean; lang?: string };

let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
export const block = (type: BlockType = 'p', text = '', extra: Partial<Block> = {}): Block => ({ id: blockId(), type, text, ...extra });

const listTypes: BlockType[] = ['bullet', 'numbered', 'todo'];
const fenceRe = /^(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const startsBlock = (line: string) => /^(#{1,3} |[-*+] |\d+[.)] |>|```|~~~|<details>\s*$)/.test(line) || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line);

// GFM pipe tables: split on unescaped `|`; outer pipes are optional. Pipes inside code spans must be escaped (`\|`), as in GFM.
const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim());
const delimiterRe = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const isTableAt = (lines: string[], i: number) => (lines[i] ?? '').includes('|') && (lines[i + 1] ?? '').includes('|') && delimiterRe.test(lines[i + 1]!)
  && splitRow(lines[i]!).length === splitRow(lines[i + 1]!).length;
export type TableAlign = 'left' | 'center' | 'right' | undefined;
export function tableCells(text: string): { header: string[]; align: TableAlign[]; rows: string[][] } | null {
  const lines = text.split('\n');
  if (!isTableAt(lines, 0)) return null;
  const header = splitRow(lines[0]!);
  const align = splitRow(lines[1]!).map((cell): TableAlign => cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : cell.startsWith(':') ? 'left' : undefined);
  const unescape = (cells: string[]) => header.map((_, index) => (cells[index] ?? '').replace(/\\\|/g, '|')); // GFM: pad short rows, drop extra cells
  return { header: unescape(header), align, rows: lines.slice(2).filter((line) => line.trim()).map((line) => unescape(splitRow(line))) };
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const listItem = (type: BlockType, first: string, indent: number, extra: Partial<Block> = {}) => {
    const text = [first];
    // Continuation lines are indented; strip the list indent so nested content round-trips verbatim.
    while (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1]!)) text.push(lines[++i]!.replace(new RegExp(`^ {0,${indent}}`), ''));
    blocks.push(block(type, text.join('\n'), extra));
  };
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if (isTableAt(lines, i)) {
      const body = [line.trim(), lines[++i]!.trim()];
      while (i + 1 < lines.length && lines[i + 1]!.includes('|') && !startsBlock(lines[i + 1]!)) body.push(lines[++i]!.trim());
      blocks.push(block('table', body.join('\n')));
    } else if ((m = line.match(fenceRe))) {
      const close = new RegExp(`^${m[1]![0] === '`' ? '`' : '~'}{${m[1]!.length},}\\s*$`);
      const body: string[] = [];
      while (++i < lines.length && !close.test(lines[i]!)) body.push(lines[i]!);
      blocks.push(block('code', body.join('\n'), m[2] ? { lang: m[2] } : {}));
    } else if (/^<details>\s*$/.test(line)) {
      const body: string[] = [];
      while (++i < lines.length && !/^<\/details>\s*$/.test(lines[i]!)) body.push(lines[i]!);
      const summary = body[0]?.match(/^<summary>(.*)<\/summary>\s*$/);
      if (summary) body.shift();
      while (body.length && !body[0]!.trim()) body.shift();
      while (body.length && !body[body.length - 1]!.trim()) body.pop();
      blocks.push(block('toggle', [summary?.[1] ?? '', ...body].join('\n')));
    } else if ((m = line.match(/^(#{1,3}) (.*)$/))) blocks.push(block(`h${m[1]!.length}` as BlockType, m[2]!));
    else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) blocks.push(block('divider'));
    else if (line.startsWith('>')) {
      const body = [line.replace(/^> ?/, '')];
      while (i + 1 < lines.length && lines[i + 1]!.startsWith('>')) body.push(lines[++i]!.replace(/^> ?/, ''));
      if (/^\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(body[0]!)) blocks.push(block('callout', body.slice(1).join('\n')));
      else blocks.push(block('quote', body.join('\n')));
    } else if ((m = line.match(/^[-*+] \[( |x|X)\](?: (.*))?$/))) listItem('todo', m[2] ?? '', 2, { checked: m[1] !== ' ' });
    else if ((m = line.match(/^[-*+] (.*)$/))) listItem('bullet', m[1]!, 2);
    else if ((m = line.match(/^\d+[.)] (.*)$/))) listItem('numbered', m[1]!, 3);
    else {
      const body = [line];
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !startsBlock(lines[i + 1]!) && !isTableAt(lines, i + 1)) body.push(lines[++i]!);
      blocks.push(block('p', body.join('\n')));
    }
  }
  return blocks;
}

function serializeBlock(b: Block, number: number): string {
  const indent = (text: string, pad: string) => text.split('\n').map((line, index) => index && line ? pad + line : line).join('\n');
  const quoted = (text: string) => text.split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
  switch (b.type) {
    case 'h1': case 'h2': case 'h3': return `${'#'.repeat(Number(b.type[1]))} ${b.text.replace(/\n/g, ' ')}`;
    case 'bullet': return `- ${indent(b.text, '  ')}`;
    case 'numbered': return `${number}. ${indent(b.text, '   ')}`;
    case 'todo': return `- [${b.checked ? 'x' : ' '}] ${indent(b.text, '  ')}`;
    case 'quote': return quoted(b.text);
    case 'callout': return `> [!NOTE]\n${quoted(b.text)}`;
    case 'divider': return '---';
    case 'code': {
      const fence = '`'.repeat(Math.max(3, ...(b.text.match(/`{3,}/g) ?? []).map((run) => run.length + 1)));
      return `${fence}${b.lang ?? ''}\n${b.text}\n${fence}`;
    }
    case 'toggle': {
      const [summary = '', ...body] = b.text.split('\n');
      return `<details>\n<summary>${summary}</summary>\n${body.length ? `\n${body.join('\n')}\n` : ''}</details>`;
    }
    default: return b.text;
  }
}

export function serializeMarkdown(blocks: Block[]): string {
  let out = '';
  let number = 0;
  let previous: Block | undefined;
  for (const b of blocks) {
    if (b.type === 'p' && !b.text.trim()) continue; // empty lines are editor scaffolding, not content
    number = b.type === 'numbered' && previous?.type === 'numbered' ? number + 1 : 1;
    const tight = previous && listTypes.includes(b.type) && listTypes.includes(previous.type) && (b.type === 'numbered') === (previous.type === 'numbered');
    out += (previous ? (tight ? '\n' : '\n\n') : '') + serializeBlock(b, number);
    previous = b;
  }
  return out;
}

const mentionRe = /\[@([^\]]*)\]\(#issue-([0-9a-f-]{36})\)/g;
export const mentionToken = (title: string, issueId: string) => `[@${title.replace(/[[\]]/g, ' ').trim()}](#issue-${issueId})`;
export const mentionedIssueIds = (markdown: string) => [...markdown.matchAll(mentionRe)].map((m) => m[2]!);
