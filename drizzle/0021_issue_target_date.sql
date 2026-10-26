ALTER TABLE issues ADD COLUMN target_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE issues ADD COLUMN target_all_day boolean NOT NULL DEFAULT false;
