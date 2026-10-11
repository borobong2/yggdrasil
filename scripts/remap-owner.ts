// Usage (from products/yggdrasil):
//   DATABASE_URL=... tsx scripts/remap-owner.ts --from <uuid> --to <uuid> [--dry-run] [--force]
// Moves every row owned by --from to --to in one transaction (dry-run = same work, then ROLLBACK).
// Rerun-safe: once --from owns nothing, every count is 0. Refuses when --to already owns data unless --force.
import { parseArgs } from 'node:util';
import pg from 'pg';
import { checkDatabaseUrl } from '../src/server/database-url.js';

const { values } = parseArgs({ options: {
  from: { type: 'string' },
  to: { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  force: { type: 'boolean', default: false }
} });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { from, to } = values;
if (!process.env.DATABASE_URL || !from || !to || !uuid.test(from) || !uuid.test(to) || from.toLowerCase() === to.toLowerCase()) {
  console.error('Pass --from <uuid> --to <uuid> (different) with DATABASE_URL set. Optional: --dry-run, --force.');
  process.exit(1);
}

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const client = new pg.Client({ connectionString: checkDatabaseUrl(process.env.DATABASE_URL) });
await client.connect();
let exitCode = 0;
try {
  await client.query('BEGIN');

  // Owner columns are discovered from the live schema, so tables added later are covered automatically.
  const { rows: columns } = await client.query<{ table: string; column: string }>(`
    SELECT table_name AS table, column_name AS column FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name IN ('owner_id', 'actor_id') AND table_name <> 'app_owners'
    ORDER BY table_name, column_name`);
  const tables = new Map<string, string[]>();
  for (const { table, column } of columns) tables.set(table, [...(tables.get(table) ?? []), column]);
  for (const [table, cols] of tables) if (!cols.includes('owner_id')) throw new Error(`${table}.actor_id without owner_id: decide how to scope it before remapping`);
  // Anything referencing app_owners through another column would be missed: fail loudly instead.
  const { rows: unknownRefs } = await client.query<{ ref: string }>(`
    SELECT c.conrelid::regclass || '.' || a.attname AS ref FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = to_regclass('app_owners') AND a.attname <> 'owner_id'`);
  if (unknownRefs.length) throw new Error(`Unhandled references to app_owners: ${unknownRefs.map((r) => r.ref).join(', ')}`);

  const owned = async (owner: string) => {
    const counts: Record<string, number> = {};
    for (const table of tables.keys()) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${ident(table)} WHERE owner_id = $1`, [owner]);
      counts[table] = rows[0].n;
    }
    return counts;
  };
  const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

  const toOwned = await owned(to);
  if (total(await owned(from)) > 0 && total(toOwned) > 0 && !values.force) {
    console.error(`Refusing: ${to} already owns data (${Object.entries(toOwned).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')}). Rerun with --force to merge.`);
    exitCode = 2;
  } else {
    const counts: Record<string, number> = {};
    // 1. Parent row for the new owner first (documents.owner_id -> app_owners FK).
    counts['app_owners (insert)'] = (await client.query(
      'INSERT INTO app_owners (owner_id, created_at) SELECT $2, created_at FROM app_owners WHERE owner_id = $1 ON CONFLICT DO NOTHING', [from, to])).rowCount ?? 0;
    // 2. Every child table in ONE statement: non-deferrable FKs (e.g. issue_evidence(issue_id, owner_id) ->
    //    issues(id, owner_id)) are checked at statement end, when both sides already carry the new owner.
    //    actor_id only changes on rows owned by --from; other owners' rows are never touched.
    const names = [...tables.keys()];
    const ctes = names.map((table, i) => {
      const actor = tables.get(table)!.includes('actor_id') ? ', actor_id = CASE WHEN actor_id = $1 THEN $2 ELSE actor_id END' : '';
      return `t${i} AS (UPDATE ${ident(table)} SET owner_id = $2${actor} WHERE owner_id = $1 RETURNING 1)`;
    });
    if (names.length) {
      const { rows } = await client.query(`WITH ${ctes.join(', ')} SELECT ${names.map((_, i) => `(SELECT count(*)::int FROM t${i}) AS c${i}`).join(', ')}`, [from, to]);
      names.forEach((table, i) => { counts[table] = rows[0][`c${i}`]; });
    }
    // 3. Old parent row last, once nothing references it.
    counts['app_owners (delete)'] = (await client.query('DELETE FROM app_owners WHERE owner_id = $1', [from])).rowCount ?? 0;

    for (const [table, n] of Object.entries(counts)) console.log(`${table.padEnd(28)} ${n}`);
    console.log(`${'total'.padEnd(28)} ${total(counts)}`);
  }

  await client.query(values['dry-run'] || exitCode ? 'ROLLBACK' : 'COMMIT');
  if (!exitCode) console.log(values['dry-run'] ? 'dry-run: rolled back, nothing changed' : `committed: ${from} -> ${to}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
process.exit(exitCode);
