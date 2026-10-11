# Data migration: local Postgres → Supabase (Seoul)

Moves the local data (owned by the dev owner `00000000-0000-4000-8000-000000000001`) into the Supabase
project and hands it to the owner's Supabase Auth user. Local data is only read, never changed.

Run everything from `products/yggdrasil`. The local machine has no `psql`/`pg_dump`, so the client tools of
the `yggdrasil-postgres-1` container (Postgres 16) are used for both ends.

## Connection strings and SSL

SSL is configured by the URL alone: the app's `pg` Pool and `drizzle-kit migrate` both parse `sslmode` from
`DATABASE_URL`. `src/server/database-url.ts` refuses a Supabase URL without `sslmode`, because Supabase's
dashboard strings carry none and `pg` would then connect in plaintext. Local URLs are unchanged (no SSL).

| Use | Host / port (Supabase dashboard → Connect) | Query string |
|---|---|---|
| App on Cloud Run | transaction pooler `aws-…-ap-northeast-2.pooler.supabase.com:6543` | `?sslmode=require&uselibpqcompat=true` |
| `db:migrate`, `remap-owner.ts` | session pooler, same host, `:5432` | `?sslmode=require&uselibpqcompat=true` |
| `psql` (restore, checks) | session pooler `:5432` | `?sslmode=require` |

Both poolers are IPv4 (the direct `db.<ref>.supabase.co` host is IPv6-only). The pooler user is
`postgres.<project-ref>`.

Why `uselibpqcompat=true`: in `pg` 8.x (`pg-connection-string` 2.x), `sslmode=require` is silently treated
as `verify-full`. Supabase signs its certificates with its own CA, so `verify-full` without that CA fails
with `self-signed certificate in certificate chain`. `uselibpqcompat=true&sslmode=require` gives the libpq
meaning: encrypted, certificate not checked. It is also what `pg` 9 will do by default, so it does not
change on upgrade. `test/db.test.ts` pins this behavior.

Stricter option: download the CA from Supabase (Settings → Database → SSL Configuration), mount it on Cloud
Run as a secret file, and use `?sslmode=verify-full&sslrootcert=/secrets/supabase-ca.crt`. Try it against
the pooler before switching over: if the host name check fails, stay on `require`.

```sh
export SUPA_SESSION='postgres://postgres.<ref>:<password>@aws-…-ap-northeast-2.pooler.supabase.com:5432/postgres'
export OWNER_FROM=00000000-0000-4000-8000-000000000001
export OWNER_TO=<the owner's auth.users id>   # Supabase → Authentication → Users, after the first Google login
```

## Steps

1. **Back up first.**
   ```sh
   docker exec yggdrasil-postgres-1 pg_dump -U yggdrasil -Fc yggdrasil > ~/yggdrasil-backup-$(date +%F).dump
   ```
   If the Supabase project already holds data, back it up too (dashboard → Database → Backups, or `pg_dump` over `$SUPA_SESSION?sslmode=require`).

2. **Create the schema on Supabase** (session pooler, port 5432):
   ```sh
   DATABASE_URL="$SUPA_SESSION?sslmode=require&uselibpqcompat=true" npm run db:migrate
   ```

3. **Close the Data API to these tables.** Supabase exposes `public` through PostgREST with the public anon
   key. Either turn off the Data API (Settings → API), or enable RLS with no policies (the app connects as
   the table owner, which bypasses RLS):
   ```sh
   docker exec -i yggdrasil-postgres-1 psql "$SUPA_SESSION?sslmode=require" -v ON_ERROR_STOP=1 -c "
   DO \$\$ DECLARE t text; BEGIN
     FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
       EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
     END LOOP; END \$\$;"
   ```

4. **Count rows on both sides** (save the local output; the Supabase side must be all zero before restoring):
   ```sh
   COUNTS="SELECT 'activities' t, count(*) FROM activities UNION ALL SELECT 'app_owners', count(*) FROM app_owners
     UNION ALL SELECT 'captures', count(*) FROM captures UNION ALL SELECT 'delivery_plan_acceptances', count(*) FROM delivery_plan_acceptances
     UNION ALL SELECT 'delivery_plan_proposals', count(*) FROM delivery_plan_proposals UNION ALL SELECT 'document_issue_links', count(*) FROM document_issue_links
     UNION ALL SELECT 'documents', count(*) FROM documents UNION ALL SELECT 'epics', count(*) FROM epics UNION ALL SELECT 'goals', count(*) FROM goals
     UNION ALL SELECT 'issue_evidence', count(*) FROM issue_evidence UNION ALL SELECT 'issues', count(*) FROM issues
     UNION ALL SELECT 'personal_access_tokens', count(*) FROM personal_access_tokens UNION ALL SELECT 'suggestions', count(*) FROM suggestions ORDER BY 1"
   docker exec yggdrasil-postgres-1 psql -U yggdrasil -d yggdrasil -Atc "$COUNTS" > ~/yggdrasil-local-counts.txt
   docker exec yggdrasil-postgres-1 psql "$SUPA_SESSION?sslmode=require" -Atc "$COUNTS"
   ```

5. **Dump local data only** (`public` schema; the `drizzle` migration journal was written by step 2):
   ```sh
   docker exec yggdrasil-postgres-1 pg_dump -U yggdrasil --data-only --schema=public yggdrasil > ~/yggdrasil-data.sql
   ```
   The warning about circular foreign keys on `documents` (self-reference via `parent_id`) is harmless:
   each table loads in one `COPY`, and foreign keys are checked at the end of that statement. Do not use
   `--disable-triggers`; the Supabase `postgres` role is not a superuser.

6. **Restore into Supabase** in one transaction (any error rolls the whole load back):
   ```sh
   docker exec -i yggdrasil-postgres-1 psql "$SUPA_SESSION?sslmode=require" --single-transaction -v ON_ERROR_STOP=1 -q < ~/yggdrasil-data.sql
   ```

7. **Hand the data to the Supabase user** (dry run, then real run, then a rerun that must report `total 0`):
   ```sh
   export DATABASE_URL="$SUPA_SESSION?sslmode=require&uselibpqcompat=true"
   npx tsx scripts/remap-owner.ts --from $OWNER_FROM --to $OWNER_TO --dry-run
   npx tsx scripts/remap-owner.ts --from $OWNER_FROM --to $OWNER_TO
   npx tsx scripts/remap-owner.ts --from $OWNER_FROM --to $OWNER_TO
   ```
   The script finds every `owner_id`/`actor_id` column in `public`, moves app_owners → child tables →
   old app_owners row in one transaction, and prints per-table counts. If `$OWNER_TO` already created data
   on Supabase it refuses; add `--force` to merge the two.

8. **Verify.** Counts equal `~/yggdrasil-local-counts.txt`, and only `$OWNER_TO` owns rows:
   ```sh
   docker exec yggdrasil-postgres-1 psql "$SUPA_SESSION?sslmode=require" -Atc "$COUNTS" | diff ~/yggdrasil-local-counts.txt -
   docker exec yggdrasil-postgres-1 psql "$SUPA_SESSION?sslmode=require" -Atc "
     SELECT owner_id, count(*) FROM issues GROUP BY 1;
     SELECT owner_id, actor_id, count(*) FROM activities GROUP BY 1, 2;"
   ```
   Then log in with Google on the deployed app and check the todo list.

9. **Point Cloud Run at the transaction pooler**: `DATABASE_URL=postgres://postgres.<ref>:<password>@aws-…-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true`
   (store it in Secret Manager). Transaction mode is fine for `pg`: it does not use named prepared statements.

## Rollback

Local data is untouched. To retry on Supabase, empty the tables
(`TRUNCATE app_owners, captures, suggestions, delivery_plan_proposals, delivery_plan_acceptances, goals, epics, issues, activities, issue_evidence, personal_access_tokens, documents, document_issue_links;`)
and restart from step 4.
