
/*
  # Delete all quotes for Sero Apartments (Leehan Construction Limited)

  Removes all quote items, parsing jobs, and quotes for the Sero Apartments project
  so the user can start fresh with new uploads.

  Project ID: db8ee823-c13e-4a2e-850d-7806ada5fc5a
  Quote IDs:
    - 18acae2e-5c1f-4159-83d1-c10d7f232aba (Hippo Plumbing & Drainage)
    - e098573d-3824-4904-b749-c19ce879a063 (EH Plumbing LTD)
    - 94bed32f-e611-438f-b502-23a795e7e961 (Choice Plumbing)
*/

DELETE FROM quote_items
WHERE quote_id IN (
  '18acae2e-5c1f-4159-83d1-c10d7f232aba',
  'e098573d-3824-4904-b749-c19ce879a063',
  '94bed32f-e611-438f-b502-23a795e7e961'
);

DELETE FROM parsing_jobs
WHERE quote_id IN (
  '18acae2e-5c1f-4159-83d1-c10d7f232aba',
  'e098573d-3824-4904-b749-c19ce879a063',
  '94bed32f-e611-438f-b502-23a795e7e961'
);

DELETE FROM quotes
WHERE id IN (
  '18acae2e-5c1f-4159-83d1-c10d7f232aba',
  'e098573d-3824-4904-b749-c19ce879a063',
  '94bed32f-e611-438f-b502-23a795e7e961'
);
