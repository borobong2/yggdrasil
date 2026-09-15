CREATE TABLE goals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_owner_created_idx ON goals (owner_id, created_at DESC, id DESC);

CREATE TABLE epics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX epics_owner_goal_idx ON epics (owner_id, goal_id, created_at DESC, id DESC);

CREATE TABLE issues (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  epic_id uuid NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'doing', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issues_owner_epic_idx ON issues (owner_id, epic_id, created_at DESC, id DESC);

CREATE TABLE personal_access_tokens (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 100),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX personal_access_tokens_owner_created_idx ON personal_access_tokens (owner_id, created_at DESC, id DESC);
