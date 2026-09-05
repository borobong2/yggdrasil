CREATE TABLE "captures" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_id" uuid NOT NULL,
  "text" text NOT NULL,
  "status" text DEFAULT 'inbox' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "captures_owner_created_at_idx" ON "captures" ("owner_id", "created_at" DESC);
