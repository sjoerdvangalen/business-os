-- Fix contact_validation_log CHECK constraints
-- final_method: 'existing' was missing (contacts with pre-existing email)
-- final_status: already correct from previous fix

ALTER TABLE contact_validation_log
  DROP CONSTRAINT IF EXISTS contact_validation_log_final_method_check;

ALTER TABLE contact_validation_log
  ADD CONSTRAINT contact_validation_log_final_method_check
  CHECK (final_method = ANY (ARRAY[
    'trykitt','enrow','omni','fallback',
    'enrow_pattern','trykitt_find','enrow_find',
    'omni_reconfirm','omni_rejected','failed','existing'
  ]));
