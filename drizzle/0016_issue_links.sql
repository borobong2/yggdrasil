-- YG-42: free-form links on a todo (docs, web pages, local paths, PRs). A jsonb array on the row: links are
-- only ever read and replaced with their todo, so no join table. Shape is validated in the app (src/server/links.ts).
ALTER TABLE issues ADD COLUMN links jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (CASE WHEN jsonb_typeof(links) = 'array' THEN jsonb_array_length(links) <= 20 ELSE false END);
