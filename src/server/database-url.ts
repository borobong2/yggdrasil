// No imports on purpose: drizzle.config.ts loads this through drizzle-kit's CJS loader.
// SSL comes from DATABASE_URL itself (pg and drizzle-kit both parse sslmode), see docs/deploy/data-migration.md.
// Supabase connection strings from the dashboard carry no sslmode, and pg would then connect in plaintext: refuse that.
export function checkDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (/@[^/]*supabase\.(com|co)/.test(databaseUrl) && !/[?&]sslmode=/.test(databaseUrl)) {
    throw new Error('DATABASE_URL points at Supabase without sslmode; append ?sslmode=require&uselibpqcompat=true (or verify-full + sslrootcert)');
  }
  return databaseUrl;
}
