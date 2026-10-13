-- YG-38 all-day dates, YG-37 completion time, YG-39 soft archive. No new tables, so RLS from 0011 still covers issues.
ALTER TABLE issues
  ADD COLUMN due_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN scheduled_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN archived_at timestamptz;

-- Date-only input used to be stored as 00:00 Asia/Seoul (= 15:00:00 UTC): those rows were all-day.
-- A timed recurring series whose time is exactly 00:00 stays timed.
UPDATE issues i SET due_all_day = true
  WHERE (due_at AT TIME ZONE 'UTC')::time = '15:00:00'
    AND NOT EXISTS (SELECT 1 FROM recurrences r WHERE r.id = i.recurrence_id AND r.time IS NOT NULL);
UPDATE issues i SET scheduled_all_day = true
  WHERE (scheduled_at AT TIME ZONE 'UTC')::time = '15:00:00'
    AND NOT EXISTS (SELECT 1 FROM recurrences r WHERE r.id = i.recurrence_id AND r.time IS NOT NULL);

-- Done rows get their last completion from the activity log, else their last update.
UPDATE issues i SET completed_at = coalesce((
  SELECT max(a.created_at) FROM activities a
  WHERE a.owner_id = i.owner_id AND a.subject_id = i.id AND (a.kind = 'issue.completed' OR (a.kind = 'issue.moved' AND a.payload->>'to' = 'done'))
), i.updated_at) WHERE status = 'done';

-- Every completion path (todo service, bulk, board move, legacy /api/issues, GitHub webhook) writes status only;
-- this keeps completed_at in step: stamped on entering done unless the writer supplied one, cleared on reopen.
CREATE FUNCTION issues_completed_at() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'done' THEN NEW.completed_at := NULL;
  ELSIF NEW.completed_at IS NULL THEN NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issues_completed_at BEFORE INSERT OR UPDATE OF status, completed_at ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_completed_at();
ALTER TABLE issues ADD CONSTRAINT issues_completed_at_check CHECK ((status = 'done') = (completed_at IS NOT NULL));
