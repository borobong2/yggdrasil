ALTER TABLE delivery_plan_proposals DROP CONSTRAINT delivery_plan_proposals_status_check;
ALTER TABLE delivery_plan_proposals ADD CONSTRAINT delivery_plan_proposals_status_check CHECK (status IN ('pending', 'accepted', 'dismissed'));

CREATE TABLE delivery_plan_acceptances (
  proposal_id uuid PRIMARY KEY REFERENCES delivery_plan_proposals(id),
  owner_id uuid NOT NULL,
  capture_id uuid NOT NULL REFERENCES captures(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  goal_id uuid NOT NULL REFERENCES goals(id),
  epic_id uuid NOT NULL REFERENCES epics(id),
  issue_ids jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_plan_acceptances_owner_created_idx ON delivery_plan_acceptances (owner_id, accepted_at DESC, proposal_id DESC);
