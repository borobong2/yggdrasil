CREATE TABLE suggestions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  capture_id uuid NOT NULL REFERENCES captures(id),
  title text NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  type text NOT NULL CHECK (type IN ('inbox', 'document', 'project', 'issue')),
  target_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  model jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suggestions_owner_capture_idx ON suggestions(owner_id, capture_id, created_at DESC, id DESC);
