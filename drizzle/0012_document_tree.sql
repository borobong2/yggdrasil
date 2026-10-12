-- YG-23: sibling order, trash, and a per-page emoji icon. No new tables, so RLS from 0011 still covers documents.
ALTER TABLE documents
  ADD COLUMN position integer NOT NULL DEFAULT 0,
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN icon text CHECK (icon IS NULL OR char_length(icon) BETWEEN 1 AND 16);
--> statement-breakpoint
UPDATE documents d SET position = ordered.n FROM (
  SELECT id, row_number() OVER (PARTITION BY owner_id, parent_id ORDER BY created_at, id)::int - 1 AS n FROM documents
) ordered WHERE d.id = ordered.id;
--> statement-breakpoint
CREATE INDEX documents_owner_parent_position_idx ON documents (owner_id, parent_id, position) WHERE archived_at IS NULL;
