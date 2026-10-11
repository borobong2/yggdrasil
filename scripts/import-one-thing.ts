// Usage (from products/yggdrasil):
//   tsx scripts/import-one-thing.ts --dry-run [--dir <todos dir>]
//   DATABASE_URL=... tsx scripts/import-one-thing.ts --owner <uuid> [--dir <todos dir>]   (skips existing source+title, safe to rerun)
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseOneThing, type ParseResult } from './one-thing/parse.js';

const { values } = parseArgs({ options: {
  'dry-run': { type: 'boolean', default: false },
  owner: { type: 'string' },
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

async function importAll(ownerId: string, { todos }: ParseResult) {
  // Loaded lazily: these modules connect to DATABASE_URL on import, which --dry-run must not need.
  const { and, eq } = await import('drizzle-orm');
  const { getDb } = await import('../src/server/db.js');
  const { issues } = await import('../src/server/schema.js');
  const { createTodo } = await import('../src/server/todos.js');
  const db = getDb();
  let created = 0; let existing = 0;
  try {
    for (const { area, epic, title, status, hold, holdReason, priority, dueAt, scheduledAt, estimateMinutes, notes, source } of todos) {
      const found = await db.select({ id: issues.id }).from(issues).where(and(eq(issues.ownerId, ownerId), eq(issues.source, source), eq(issues.title, title.trim()))).limit(1);
      if (found.length) { existing++; continue; }
      await createTodo(ownerId, { area, epic, title, status, hold, holdReason, priority, dueAt, scheduledAt, estimateMinutes, notes, source }, 'import');
      created++;
    }
  } finally { await db.$client.end(); }
  console.log(`created ${created}, skipped existing ${existing}, total parsed ${todos.length}`);
}

const parsed = readAll(values.dir);
if (values['dry-run']) console.log(report(parsed));
else if (values.owner && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.owner)) await importAll(values.owner, parsed);
else { console.error('Pass --dry-run, or --owner <uuid> with DATABASE_URL set.'); process.exit(1); }
