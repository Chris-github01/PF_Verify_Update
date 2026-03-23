/*
  # Reset Sero Apartments Project Data (v2)

  Removes all quote data and related records from the Sero Apartments project
  (db8ee823-c13e-4a2e-850d-7806ada5fc5a) so the user can start fresh.

  Deletes in dependency order then resets workflow flags on the project.
*/

DO $$
DECLARE
  v_project_id uuid := 'db8ee823-c13e-4a2e-850d-7806ada5fc5a';
  v_quote_ids uuid[];
BEGIN
  SELECT ARRAY(SELECT id FROM quotes WHERE project_id = v_project_id)
  INTO v_quote_ids;

  DELETE FROM award_approvals WHERE final_approved_quote_id = ANY(v_quote_ids);
  DELETE FROM quote_revision_timeline WHERE quote_id = ANY(v_quote_ids);
  DELETE FROM quote_revisions_diff WHERE revised_quote_id = ANY(v_quote_ids) OR original_quote_id = ANY(v_quote_ids);
  DELETE FROM revision_request_suppliers WHERE quote_id = ANY(v_quote_ids);
  DELETE FROM prelet_appendix WHERE quote_id = ANY(v_quote_ids);
  DELETE FROM commercial_baseline_items WHERE source_quote_id = ANY(v_quote_ids);
  DELETE FROM parsing_jobs WHERE quote_id = ANY(v_quote_ids);
  DELETE FROM quote_items WHERE quote_id = ANY(v_quote_ids);

  UPDATE projects SET approved_quote_id = NULL WHERE id = v_project_id;

  DELETE FROM quotes WHERE project_id = v_project_id;

  -- Reset workflow completion flags
  UPDATE projects SET
    scope_matrix_completed = false,
    equalisation_completed = false,
    boq_builder_completed = false,
    boq_builder_completed_at = NULL,
    fire_schedule_imported = false,
    fire_schedule_imported_at = NULL
  WHERE id = v_project_id;

END $$;
