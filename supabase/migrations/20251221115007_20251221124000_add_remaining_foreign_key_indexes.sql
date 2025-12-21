/*
  # Add Remaining Foreign Key Indexes

  Adds indexes for 19 foreign keys that were reported as unindexed.
  These indexes will improve JOIN performance and foreign key constraint checks.

  ## Foreign Keys Indexed
  - audit_events.actor_user_id
  - audit_exports.audit_id
  - audit_findings (2 foreign keys)
  - audits.project_id
  - award_approvals.final_approved_quote_id
  - award_reports.approval_id
  - contract_allowances.created_by
  - letters_of_intent.created_by
  - onboarding_audit_log.user_id
  - onboarding_compliance_documents.verified_by
  - organisation_members.invited_by_user_id
  - project_sharing.shared_with_user_id
  - quotes.supplier_id
  - scope_categories.project_id
  - security_audit_log (2 foreign keys)
  - team_invitations.organisation_id
  - user_activity_log.user_id
*/

-- Audit system indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id 
  ON audit_events(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_exports_audit_id 
  ON audit_exports(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_id 
  ON audit_findings(audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_findings_supplier_id 
  ON audit_findings(supplier_id);

CREATE INDEX IF NOT EXISTS idx_audits_project_id 
  ON audits(project_id);

-- Award system indexes
CREATE INDEX IF NOT EXISTS idx_award_approvals_final_approved_quote_id 
  ON award_approvals(final_approved_quote_id);

CREATE INDEX IF NOT EXISTS idx_award_reports_approval_id 
  ON award_reports(approval_id);

-- Contract management indexes
CREATE INDEX IF NOT EXISTS idx_contract_allowances_created_by 
  ON contract_allowances(created_by);

CREATE INDEX IF NOT EXISTS idx_letters_of_intent_created_by 
  ON letters_of_intent(created_by);

-- Onboarding system indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_audit_log_user_id 
  ON onboarding_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_documents_verified_by 
  ON onboarding_compliance_documents(verified_by);

-- Organisation and team indexes
CREATE INDEX IF NOT EXISTS idx_organisation_members_invited_by_user_id 
  ON organisation_members(invited_by_user_id);

CREATE INDEX IF NOT EXISTS idx_team_invitations_organisation_id 
  ON team_invitations(organisation_id);

-- Project and sharing indexes
CREATE INDEX IF NOT EXISTS idx_project_sharing_shared_with_user_id 
  ON project_sharing(shared_with_user_id);

CREATE INDEX IF NOT EXISTS idx_scope_categories_project_id 
  ON scope_categories(project_id);

-- Quote system indexes
CREATE INDEX IF NOT EXISTS idx_quotes_supplier_id 
  ON quotes(supplier_id);

-- Security and activity indexes
CREATE INDEX IF NOT EXISTS idx_security_audit_log_organisation_id 
  ON security_audit_log(organisation_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id 
  ON security_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id 
  ON user_activity_log(user_id);
