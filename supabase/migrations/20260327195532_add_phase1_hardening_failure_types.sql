/*
  # Phase 1.5 Hardening — Add 2 New Failure Types to shadow_failure_types

  ## Changes
  - Inserts 2 new failure type records into shadow_failure_types
  - Uses INSERT ... WHERE NOT EXISTS to be safely idempotent

  ## New Failure Types

  1. document_extraction_failure
     - Severity: high
     - Business impact: financial_accuracy
     - Triggered when: parser produced line items but found no document-level total anchor

  2. confidence_misalignment
     - Severity: medium
     - Business impact: trust
     - Triggered when: diagnostics confidence is high (>=80) but parsed total deviates >15% from document total

  ## Notes
  - These failure codes are now handled in failureClassifier.ts
  - No existing tables modified
  - No existing failure types removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shadow_failure_types WHERE failure_code = 'document_extraction_failure'
  ) THEN
    INSERT INTO shadow_failure_types (
      failure_code, title, description, severity, business_impact_type, active
    ) VALUES (
      'document_extraction_failure',
      'Document Extraction Failure',
      'Parser produced line items but could not locate a document-level total anchor. The reference total could not be extracted from the source document, making financial validation impossible.',
      'high',
      'financial_accuracy',
      true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shadow_failure_types WHERE failure_code = 'confidence_misalignment'
  ) THEN
    INSERT INTO shadow_failure_types (
      failure_code, title, description, severity, business_impact_type, active
    ) VALUES (
      'confidence_misalignment',
      'Confidence Misalignment',
      'Diagnostics assigned high confidence to this document but the parsed total deviates significantly from the document total. Indicates a structural parse error masked by a clean document format.',
      'medium',
      'trust',
      true
    );
  END IF;
END $$;
