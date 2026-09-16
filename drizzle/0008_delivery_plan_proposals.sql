CREATE TABLE delivery_plan_proposals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  capture_id uuid NOT NULL REFERENCES captures(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status = 'pending'),
  design jsonb NOT NULL,
  lanes jsonb NOT NULL,
  model jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_plan_proposals_owner_capture_created_idx ON delivery_plan_proposals (owner_id, capture_id, created_at DESC, id DESC);
