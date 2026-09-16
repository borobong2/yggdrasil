ALTER TABLE issues ADD CONSTRAINT issues_id_owner_key UNIQUE (id, owner_id);
ALTER TABLE issue_evidence ADD CONSTRAINT issue_evidence_issue_owner_fkey FOREIGN KEY (issue_id, owner_id) REFERENCES issues(id, owner_id) ON DELETE CASCADE;
