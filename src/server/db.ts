import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { checkDatabaseUrl } from './database-url.js';
import * as schema from './schema.js';

let database: ReturnType<typeof createDb> | undefined;

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  return drizzle(new Pool({ connectionString: checkDatabaseUrl(databaseUrl) }), { schema });
}

export function getDb() {
  return database ??= createDb();
}
