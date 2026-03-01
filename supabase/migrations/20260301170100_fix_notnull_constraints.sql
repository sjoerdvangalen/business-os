-- Drop NOT NULL constraints on columns that may be empty in Airtable data

-- domains
ALTER TABLE domains ALTER COLUMN provider DROP NOT NULL;
ALTER TABLE domains ALTER COLUMN domain DROP NOT NULL;

-- contracts
ALTER TABLE contracts ALTER COLUMN retainer DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN meeting_fee DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN commission_pct DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN contract_name DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN status DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN duration_months DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN client_id DROP NOT NULL;

-- invoices
ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN amount_excl_vat DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN invoice_name DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN status DROP NOT NULL;
