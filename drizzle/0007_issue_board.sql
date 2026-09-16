ALTER TABLE issues ADD COLUMN position integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY owner_id, status ORDER BY created_at ASC, id ASC) - 1 AS position
  FROM issues
)
UPDATE issues SET position = ordered.position FROM ordered WHERE issues.id = ordered.id;

CREATE INDEX issues_owner_status_position_idx ON issues (owner_id, status, position, id);

CREATE TABLE activities (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  kind text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_owner_created_idx ON activities (owner_id, created_at DESC, id DESC);
