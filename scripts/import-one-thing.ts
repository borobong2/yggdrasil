// Usage (from products/yggdrasil): tsx scripts/import-one-thing.ts --dry-run [--dir <todos dir>]
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseOneThing, type ParseResult } from './one-thing/parse.js';

const { values } = parseArgs({ options: {
  'dry-run': { type: 'boolean', default: false },
  dir: { type: 'string', default: resolve('../../execution/one-thing/todos') }
} });

function readAll(dir: string): ParseResult {
  const all: ParseResult = { todos: [], skipped: [], warnings: [] };
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const parsed = parseOneThing(readFileSync(join(dir, name), 'utf8'), `one-thing/todos/${name}`);
    all.todos.push(...parsed.todos); all.skipped.push(...parsed.skipped); all.warnings.push(...parsed.warnings);
  }
  return all;
}

const cell = (value: unknown) => String(value ?? '').replaceAll('|', '\\|');

function report({ todos, skipped, warnings }: ParseResult): string {
  const out = ['| area | title | status | hold | priority | due | scheduled | estimate | source |', '|---|---|---|---|---|---|---|---|---|'];
  for (const t of todos) out.push(`| ${[t.area, t.title, t.status, t.hold, t.priority, t.dueAt, t.scheduledAt, t.estimateMinutes, `${t.source}:${t.line}`].map(cell).join(' | ')} |`);
  const count = (key: (t: (typeof todos)[number]) => string | null) => Object.entries(todos.reduce<Record<string, number>>((acc, t) => { const k = key(t) ?? '-'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).map(([k, n]) => `${k} ${n}`).join(', ');
  out.push('', `## Counts`, '', `- total ${todos.length}, skipped (done) ${skipped.length}`, `- by area: ${count((t) => t.area)}`, `- by status: ${count((t) => t.status)}`, `- by hold: ${count((t) => t.hold)}`, `- by priority: ${count((t) => t.priority)}`);
  out.push('', '## Skipped (done)', '', ...skipped.map((s) => `- ${s.source}:${s.line} — ${s.text.slice(0, 80)} (${s.reason})`));
  out.push('', '## Needs a look (parsed with low confidence)', '', ...warnings.map((w) => `- ${w.source}:${w.line} — ${w.reason}: ${w.text.slice(0, 80)}`));
  return out.join('\n');
}

const parsed = readAll(values.dir);
if (values['dry-run']) console.log(report(parsed));
else { console.error('Only --dry-run is supported until YG-13 lands.'); process.exit(1); }
