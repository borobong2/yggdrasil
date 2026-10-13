-- YG-43: how long a todo really took (minutes), next to estimate_minutes. New column only, so RLS from 0011 still covers issues.
ALTER TABLE issues ADD COLUMN actual_minutes integer CHECK (actual_minutes > 0 AND actual_minutes <= 100000);
