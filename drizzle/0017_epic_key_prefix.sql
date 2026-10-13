-- YG-36: per-epic default ticket key prefix. New todos in an epic with a prefix get the next key unless the caller opts out (prefix: null).
-- Same shape as normalizePrefix (src/server/ticket-keys.ts). Clearing it only stops new keys; existing keys are permanent.
ALTER TABLE epics ADD COLUMN key_prefix text CHECK (key_prefix ~ '^[A-Z][A-Z0-9]{0,9}$');
--> statement-breakpoint
-- Seed: 프로젝트 › yggdrasil tickets are YG-<n>. No-op where that epic does not exist.
UPDATE epics SET key_prefix = 'YG' FROM goals WHERE epics.goal_id = goals.id AND goals.title = '프로젝트' AND lower(epics.title) = 'yggdrasil';
