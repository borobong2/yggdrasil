import { defineConfig } from 'drizzle-kit';
import { checkDatabaseUrl } from './src/server/database-url';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/schema.ts',
  out: './drizzle',
  // sslmode in the URL is honored by drizzle-kit's pg driver, same as the app.
  dbCredentials: { url: checkDatabaseUrl(process.env.DATABASE_URL) }
});
