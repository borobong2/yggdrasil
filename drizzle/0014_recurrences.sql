-- YG-28: recurring todos. One rule row per series; occurrences are ordinary issues pointing at it.
-- The next occurrence is created in the same transaction that completes the open one (no cron).
-- Times are Asia/Seoul wall-clock (KST has no DST), so no timezone column.
CREATE TABLE recurrences (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  freq text NOT NULL CHECK (freq IN ('daily', 'weekly', 'monthly')),
  weekdays text[] CHECK (weekdays <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
  month_day smallint CHECK (month_day BETWEEN 1 AND 31),
  time text CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((freq = 'weekly') = (coalesce(cardinality(weekdays), 0) > 0)),
  CHECK ((freq = 'monthly') = (month_day IS NOT NULL))
);
-- Ending a series deletes its rule; past and open occurrences stay as plain todos.
ALTER TABLE issues ADD COLUMN recurrence_id uuid REFERENCES recurrences (id) ON DELETE SET NULL;
CREATE INDEX issues_recurrence_idx ON issues (recurrence_id) WHERE recurrence_id IS NOT NULL;

ALTER TABLE recurrences ENABLE ROW LEVEL SECURITY;
