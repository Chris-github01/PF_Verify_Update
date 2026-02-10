/*
  # Seed SA-2017 Template and Field Definitions (Fixed)

  ## Overview
  This migration seeds the SA-2017 Subcontract Agreement template with all field definitions
  covering 13 major sections with comprehensive metadata-driven form configuration.

  ## Template
  - SA-2017 Subcontract Agreement (Construction Contracts Act 2002 compliant)

  ## Sections Covered
  1. Contract Identity - Contract reference and key dates
  2. Parties - Head contractor and subcontractor details
  3. Background & Scope - Project context and work description
  4. Bonds & Guarantees - Performance bonds and guarantees
  5. Insurance - Insurance requirements and policies
  6. Variations - Variation management process
  7. Time - Schedule and completion requirements
  8. Defects - Defects liability and maintenance
  9. Payments - Payment terms and invoicing
  10. Miscellaneous - General provisions
  11. Additional Documents - Contract documents list
  12. Special Conditions - Project-specific conditions
  13. Signatures - Execution details

  ## Field Types
  - text: Single-line text input
  - textarea: Multi-line text input
  - number: Numeric input
  - date: Date picker
  - dropdown: Select from options
  - yes_no: Yes/No/N/A dropdown
*/

-- Insert SA-2017 template
INSERT INTO contract_templates (template_code, template_name, version, is_active, metadata)
VALUES (
  'SA-2017',
  'Subcontract Agreement 2017',
  '1.0',
  true,
  '{
    "description": "Standard subcontract agreement under Construction Contracts Act 2002",
    "jurisdiction": "New Zealand",
    "compliance": ["Construction Contracts Act 2002"],
    "document_type": "Subcontract Agreement"
  }'::jsonb
)
ON CONFLICT (template_code) DO NOTHING;

-- Get the template ID for field definitions
DO $$
DECLARE
  v_template_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM contract_templates WHERE template_code = 'SA-2017';

  -- Section 1: Contract Identity (all text/date fields, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Contract Identity', 'contract_date', 'Contract Date', 'date', 1, true, 'The date this subcontract agreement is entered into'),
  (v_template_id, 'Contract Identity', 'contract_reference', 'Contract Reference Number', 'text', 2, true, 'Unique identifier for this subcontract (e.g., SA-2017-001)'),
  (v_template_id, 'Contract Identity', 'project_name', 'Project Name', 'text', 3, true, 'Name of the construction project'),
  (v_template_id, 'Contract Identity', 'project_location', 'Project Location', 'text', 4, true, 'Physical address or location of the works');

  -- Section 2: Parties (all text fields, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Parties', 'head_contractor_name', 'Head Contractor Name', 'text', 10, true, 'Legal name of the head contractor'),
  (v_template_id, 'Parties', 'head_contractor_address', 'Head Contractor Address', 'textarea', 11, true, 'Registered office address of head contractor'),
  (v_template_id, 'Parties', 'head_contractor_contact', 'Head Contractor Contact Person', 'text', 12, true, 'Primary contact for contractual matters'),
  (v_template_id, 'Parties', 'head_contractor_email', 'Head Contractor Email', 'text', 13, true, 'Email address for notices and correspondence'),
  (v_template_id, 'Parties', 'head_contractor_phone', 'Head Contractor Phone', 'text', 14, true, 'Contact phone number'),
  (v_template_id, 'Parties', 'subcontractor_name', 'Subcontractor Name', 'text', 15, true, 'Legal name of the subcontractor'),
  (v_template_id, 'Parties', 'subcontractor_address', 'Subcontractor Address', 'textarea', 16, true, 'Registered office address of subcontractor'),
  (v_template_id, 'Parties', 'subcontractor_contact', 'Subcontractor Contact Person', 'text', 17, true, 'Primary contact for subcontractor'),
  (v_template_id, 'Parties', 'subcontractor_email', 'Subcontractor Email', 'text', 18, true, 'Email address for notices and correspondence'),
  (v_template_id, 'Parties', 'subcontractor_phone', 'Subcontractor Phone', 'text', 19, true, 'Contact phone number');

  -- Section 3: Background & Scope (text fields, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Background & Scope', 'head_contract_reference', 'Head Contract Reference', 'text', 20, true, 'Reference number of the head contract'),
  (v_template_id, 'Background & Scope', 'head_contract_parties', 'Head Contract Parties', 'textarea', 21, true, 'Principal and head contractor details from head contract'),
  (v_template_id, 'Background & Scope', 'subcontract_works_description', 'Description of Subcontract Works', 'textarea', 22, true, 'Detailed description of works to be performed by subcontractor'),
  (v_template_id, 'Background & Scope', 'scope_documents', 'Scope Documents', 'textarea', 23, false, 'List of drawings, specifications, and other documents defining the scope'),
  (v_template_id, 'Background & Scope', 'exclusions', 'Exclusions from Scope', 'textarea', 24, false, 'Any items specifically excluded from the subcontract scope');

  -- Section 4: Bonds & Guarantees - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Bonds & Guarantees', 'performance_bond_required', 'Performance Bond Required', 'yes_no', 30, true, '["Yes", "No", "N/A"]'::jsonb, 'Whether a performance bond is required from the subcontractor'),
  (v_template_id, 'Bonds & Guarantees', 'retention_required', 'Retention Required', 'yes_no', 34, true, '["Yes", "No", "N/A"]'::jsonb, 'Whether retention will be held');

  -- Section 4: Bonds & Guarantees - Numeric/date fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Bonds & Guarantees', 'performance_bond_percentage', 'Performance Bond Percentage', 'number', 31, false, 'Percentage of contract value (typically 5-10%)'),
  (v_template_id, 'Bonds & Guarantees', 'performance_bond_value', 'Performance Bond Value ($)', 'number', 32, false, 'Dollar value of performance bond if fixed amount'),
  (v_template_id, 'Bonds & Guarantees', 'performance_bond_expiry', 'Performance Bond Expiry Date', 'date', 33, false, 'Date the performance bond expires or is released'),
  (v_template_id, 'Bonds & Guarantees', 'retention_percentage', 'Retention Percentage', 'number', 35, false, 'Percentage held as retention (typically 5%)');

  -- Section 4: Bonds & Guarantees - Parent company guarantee
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Bonds & Guarantees', 'parent_company_guarantee', 'Parent Company Guarantee Required', 'yes_no', 36, false, '["Yes", "No", "N/A"]'::jsonb, 'Whether parent company guarantee is required');

  -- Section 5: Insurance - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Insurance', 'public_liability_required', 'Public Liability Insurance Required', 'yes_no', 40, true, '["Yes", "No"]'::jsonb, 'Public liability insurance requirement'),
  (v_template_id, 'Insurance', 'contract_works_insurance', 'Contract Works Insurance', 'yes_no', 42, true, '["Yes", "No", "N/A"]'::jsonb, 'Who provides contract works insurance'),
  (v_template_id, 'Insurance', 'professional_indemnity_required', 'Professional Indemnity Required', 'yes_no', 43, false, '["Yes", "No", "N/A"]'::jsonb, 'Whether professional indemnity insurance required'),
  (v_template_id, 'Insurance', 'insurance_certificates_provided', 'Insurance Certificates Provided', 'yes_no', 45, false, '["Yes", "No", "Pending"]'::jsonb, 'Status of insurance certificate provision');

  -- Section 5: Insurance - Numeric fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Insurance', 'public_liability_amount', 'Public Liability Cover Amount ($)', 'number', 41, false, 'Minimum cover amount required (e.g., $10,000,000)'),
  (v_template_id, 'Insurance', 'professional_indemnity_amount', 'Professional Indemnity Amount ($)', 'number', 44, false, 'Minimum cover amount if required');

  -- Section 6: Variations - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Variations', 'daywork_rates_agreed', 'Daywork Rates Agreed', 'yes_no', 52, false, '["Yes", "No", "N/A"]'::jsonb, 'Whether daywork rates have been established');

  -- Section 6: Variations - Other fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Variations', 'variation_approval_threshold', 'Variation Approval Threshold ($)', 'number', 50, false, 'Monetary threshold requiring formal approval'),
  (v_template_id, 'Variations', 'variation_process', 'Variation Process', 'textarea', 51, false, 'Description of variation approval and pricing process'),
  (v_template_id, 'Variations', 'daywork_schedule', 'Daywork Schedule Reference', 'text', 53, false, 'Reference to daywork rates schedule if agreed');

  -- Section 7: Time - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Time', 'programme_provided', 'Programme Provided', 'yes_no', 62, false, '["Yes", "No", "Pending"]'::jsonb, 'Whether construction programme has been provided'),
  (v_template_id, 'Time', 'liquidated_damages_applicable', 'Liquidated Damages Applicable', 'yes_no', 63, true, '["Yes", "No", "N/A"]'::jsonb, 'Whether liquidated damages apply for delay');

  -- Section 7: Time - Other fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Time', 'commencement_date', 'Commencement Date', 'date', 60, true, 'Date subcontractor must commence works'),
  (v_template_id, 'Time', 'completion_date', 'Completion Date', 'date', 61, true, 'Date for practical completion of subcontract works'),
  (v_template_id, 'Time', 'liquidated_damages_rate', 'Liquidated Damages Rate ($/day)', 'number', 64, false, 'Daily rate of liquidated damages'),
  (v_template_id, 'Time', 'time_extensions_process', 'Time Extension Process', 'textarea', 65, false, 'Process for claiming time extensions');

  -- Section 8: Defects - Yes/No field with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Defects', 'maintenance_manuals_required', 'Maintenance Manuals Required', 'yes_no', 73, false, '["Yes", "No", "N/A"]'::jsonb, 'Whether O&M manuals must be provided');

  -- Section 8: Defects - Other fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Defects', 'defects_liability_period', 'Defects Liability Period (months)', 'number', 70, true, 'Duration of defects liability period (typically 12 months)'),
  (v_template_id, 'Defects', 'defects_notification_process', 'Defects Notification Process', 'textarea', 71, false, 'How defects must be notified and rectified'),
  (v_template_id, 'Defects', 'warranty_requirements', 'Warranty Requirements', 'textarea', 72, false, 'Any specific warranties required (materials, workmanship, etc.)');

  -- Section 9: Payments - Dropdown fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Payments', 'contract_price_basis', 'Contract Price Basis', 'dropdown', 81, true, '["Lump Sum", "Schedule of Rates", "Cost Plus", "Measure and Value"]'::jsonb, 'Pricing mechanism for the subcontract'),
  (v_template_id, 'Payments', 'payment_claim_frequency', 'Payment Claim Frequency', 'dropdown', 82, true, '["Monthly", "Fortnightly", "Weekly", "Milestone-based"]'::jsonb, 'How often payment claims are submitted');

  -- Section 9: Payments - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Payments', 'gst_inclusive', 'GST Inclusive', 'yes_no', 85, true, '["Yes", "No"]'::jsonb, 'Whether prices include GST'),
  (v_template_id, 'Payments', 'buyer_created_tax_invoice', 'Buyer-Created Tax Invoice', 'yes_no', 86, true, '["Yes", "No"]'::jsonb, 'Whether head contractor will issue tax invoices on behalf of subcontractor');

  -- Section 9: Payments - Other fields without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Payments', 'contract_price', 'Contract Price ($)', 'number', 80, true, 'Total subcontract price (excl. GST)'),
  (v_template_id, 'Payments', 'payment_claim_date', 'Payment Claim Date', 'text', 83, false, 'Day of month or period when claims are due'),
  (v_template_id, 'Payments', 'payment_terms_days', 'Payment Terms (days)', 'number', 84, true, 'Number of days from claim to payment (Construction Contracts Act 2002: max 20 working days)'),
  (v_template_id, 'Payments', 'payment_response_time_days', 'Payment Response Time (days)', 'number', 87, false, 'Days for head contractor to respond to payment claim (default per CCA 2002)');

  -- Section 10: Miscellaneous - Dropdown field with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Miscellaneous', 'dispute_resolution_process', 'Dispute Resolution Process', 'dropdown', 90, true, '["Arbitration", "Mediation", "Adjudication (CCA 2002)", "Court"]'::jsonb, 'Primary dispute resolution mechanism');

  -- Section 10: Miscellaneous - Yes/No fields with options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, options, help_text) VALUES
  (v_template_id, 'Miscellaneous', 'adjudication_agreement', 'Adjudication Agreement (CCA 2002)', 'yes_no', 91, true, '["Yes", "No"]'::jsonb, 'Whether parties agree to adjudication under Construction Contracts Act 2002'),
  (v_template_id, 'Miscellaneous', 'health_safety_plan_required', 'Health & Safety Plan Required', 'yes_no', 92, true, '["Yes", "No"]'::jsonb, 'Whether subcontractor must provide H&S plan'),
  (v_template_id, 'Miscellaneous', 'quality_assurance_required', 'Quality Assurance Required', 'yes_no', 93, false, '["Yes", "No", "N/A"]'::jsonb, 'Whether QA documentation required'),
  (v_template_id, 'Miscellaneous', 'assignment_allowed', 'Assignment of Subcontract Allowed', 'yes_no', 94, false, '["Yes", "No", "With Consent"]'::jsonb, 'Whether subcontract can be assigned');

  -- Section 10: Miscellaneous - Text field without options
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Miscellaneous', 'governing_law', 'Governing Law', 'text', 95, true, 'Jurisdiction governing the contract (typically New Zealand)');

  -- Section 11: Additional Documents (all text fields, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Additional Documents', 'drawings_list', 'Drawings List', 'textarea', 100, false, 'List of drawings forming part of the subcontract'),
  (v_template_id, 'Additional Documents', 'specifications_list', 'Specifications List', 'textarea', 101, false, 'List of specifications forming part of the subcontract'),
  (v_template_id, 'Additional Documents', 'other_documents', 'Other Contract Documents', 'textarea', 102, false, 'Any other documents incorporated by reference');

  -- Section 12: Special Conditions (text field, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Special Conditions', 'special_conditions_text', 'Special Conditions', 'textarea', 110, false, 'Any project-specific special conditions that modify or supplement the standard terms');

  -- Section 13: Signatures (all text/date fields, no options)
  INSERT INTO subcontract_field_definitions (template_id, section, field_key, field_label, field_type, field_order, is_required, help_text) VALUES
  (v_template_id, 'Signatures', 'head_contractor_signatory_name', 'Head Contractor Signatory Name', 'text', 120, true, 'Name of person signing for head contractor'),
  (v_template_id, 'Signatures', 'head_contractor_signatory_title', 'Head Contractor Signatory Title', 'text', 121, true, 'Title/position of signatory'),
  (v_template_id, 'Signatures', 'head_contractor_signature_date', 'Head Contractor Signature Date', 'date', 122, true, 'Date head contractor signed'),
  (v_template_id, 'Signatures', 'subcontractor_signatory_name', 'Subcontractor Signatory Name', 'text', 123, true, 'Name of person signing for subcontractor'),
  (v_template_id, 'Signatures', 'subcontractor_signatory_title', 'Subcontractor Signatory Title', 'text', 124, true, 'Title/position of signatory'),
  (v_template_id, 'Signatures', 'subcontractor_signature_date', 'Subcontractor Signature Date', 'date', 125, true, 'Date subcontractor signed');

  -- Add conditional requirement rules
  UPDATE subcontract_field_definitions
  SET required_when_json = '{"performance_bond_required": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key IN ('performance_bond_percentage', 'performance_bond_value');

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"retention_required": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'retention_percentage';

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"public_liability_required": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'public_liability_amount';

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"professional_indemnity_required": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'professional_indemnity_amount';

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"liquidated_damages_applicable": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'liquidated_damages_rate';

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"daywork_rates_agreed": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'daywork_schedule';

  UPDATE subcontract_field_definitions
  SET required_when_json = '{"buyer_created_tax_invoice": "Yes"}'::jsonb
  WHERE template_id = v_template_id
    AND field_key = 'payment_response_time_days';

END $$;