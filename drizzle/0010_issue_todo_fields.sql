ALTER TABLE issues DROP CONSTRAINT issues_priority_check;
ALTER TABLE issues ALTER COLUMN priority SET DEFAULT 'p3';
UPDATE issues SET priority = CASE priority WHEN 'high' THEN 'p2' WHEN 'medium' THEN 'p3' WHEN 'low' THEN 'p4' ELSE priority END;
ALTER TABLE issues ADD CONSTRAINT issues_priority_check CHECK (priority IN ('p1', 'p2', 'p3', 'p4'));

ALTER TABLE issues
  ADD COLUMN hold text CHECK (hold IN ('waiting', 'blocked', 'scheduled')),
  ADD COLUMN hold_reason text,
  ADD COLUMN scheduled_at timestamptz,
  ADD COLUMN notes text NOT NULL DEFAULT '',
  ADD COLUMN estimate_minutes integer CHECK (estimate_minutes > 0),
  ADD COLUMN source text;
