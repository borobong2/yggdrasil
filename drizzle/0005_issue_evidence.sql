CREATE TABLE issue_evidence (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  url text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('github_pr', 'github_commit', 'deployment')),
  status text NOT NULL DEFAULT 'linked' CHECK (status = 'linked'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue_evidence_owner_issue_created_idx ON issue_evidence (owner_id, issue_id, created_at DESC, id DESC);
