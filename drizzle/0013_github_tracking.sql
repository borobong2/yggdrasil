-- YG-24: ticket keys (YG-24), connected GitHub repos, webhook delivery log, GitHub evidence state.
ALTER TABLE issues ADD COLUMN key text CHECK (key ~ '^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*$');
CREATE UNIQUE INDEX issues_owner_key_idx ON issues (owner_id, key);

-- One counter row per owner+prefix; allocation is a single atomic upsert (see allocateKey).
CREATE TABLE ticket_counters (
  owner_id uuid NOT NULL,
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z][A-Z0-9]{0,9}$'),
  next_number integer NOT NULL CHECK (next_number > 0),
  PRIMARY KEY (owner_id, prefix)
);

CREATE TABLE github_repos (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  full_name text NOT NULL CHECK (full_name ~ '^[a-z0-9-]+/[a-z0-9._-]+$'),
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z][A-Z0-9]{0,9}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz,
  last_status text,
  UNIQUE (owner_id, full_name)
);
CREATE INDEX github_repos_full_name_idx ON github_repos (full_name);

CREATE TABLE github_deliveries (
  delivery_id text PRIMARY KEY,
  event text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE issue_evidence DROP CONSTRAINT issue_evidence_kind_check;
ALTER TABLE issue_evidence ADD CONSTRAINT issue_evidence_kind_check CHECK (kind IN ('github_pr', 'github_commit', 'github_branch', 'deployment'));
ALTER TABLE issue_evidence
  ADD COLUMN state text,
  ADD COLUMN ci text,
  ADD COLUMN pr_number integer,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ticket_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_deliveries ENABLE ROW LEVEL SECURITY;
