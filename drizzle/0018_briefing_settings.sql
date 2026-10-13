-- YG-29: morning briefing (Telegram). One row per owner; no row = defaults (enabled, 07:00 KST, never sent).
CREATE TABLE briefing_settings (
  owner_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  send_time text NOT NULL DEFAULT '07:00' CHECK (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  last_sent_date date
);
ALTER TABLE briefing_settings ENABLE ROW LEVEL SECURITY;
