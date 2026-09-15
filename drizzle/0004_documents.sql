CREATE TABLE documents (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES app_owners(owner_id),
  parent_id uuid REFERENCES documents(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_owner_parent_created_idx ON documents (owner_id, parent_id, created_at DESC, id DESC);

CREATE TABLE document_issue_links (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, issue_id)
);
CREATE INDEX document_issue_links_issue_idx ON document_issue_links (issue_id, created_at DESC);
