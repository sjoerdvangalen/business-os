-- clients had an update_clients_updated_at trigger referencing updated_at
-- but the column didn't exist — adding it now
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
