-- YG-21: Supabase exposes `public` via its Data API to anon/authenticated, and the anon key is public.
-- RLS with no policies denies those roles everything. The app connects as the table owner, which
-- bypasses RLS (no FORCE). New tables must enable RLS too; test/rls.test.ts fails otherwise.
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_plan_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_plan_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_issue_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE epics ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Second layer: strip grants from Supabase API roles. Plain local Postgres has no such roles.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
