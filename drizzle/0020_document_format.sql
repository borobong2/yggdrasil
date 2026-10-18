ALTER TABLE documents ADD COLUMN format text NOT NULL DEFAULT 'markdown' CHECK (format IN ('markdown', 'html'));
