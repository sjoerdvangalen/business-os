-- Fix idx_contacts_available: remove invalid status values (no_show, unqualified)
-- that are not in the contact_status CHECK constraint
DROP INDEX IF EXISTS idx_contacts_available;

CREATE INDEX IF NOT EXISTS idx_contacts_available
  ON contacts(available_for_reuse_after, times_targeted)
  WHERE contact_status IN ('new', 'qualified', 'not_interested');
