-- Auto-generate client_code and calendar_webhook_token on client creation
--
-- client_code rules:
--   1 word  → first 4 letters              (Pescheck → PESC)
--   2 words → first 3 of word1 + 1 of word2 (Better Socials → BETS)
--   3 words → first 2 + 1 + 1              (Quality Lead Formula → QULF)
--   4+ words → first letter of each (up to 4) (Next Level Amazon Agency → NLAA)
--
-- calendar_webhook_token format: {code}-{8 random hex}   (e.g. frtc-a3f8c291)

-- ── 1. Pure function: name → base code ──────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_client_code(client_name TEXT)
RETURNS TEXT AS $$
DECLARE
  words TEXT[];
BEGIN
  -- Normalise whitespace, split into words
  words := array_remove(
    string_to_array(regexp_replace(trim(client_name), '\s+', ' ', 'g'), ' '),
    ''
  );

  RETURN upper(CASE array_length(words, 1)
    WHEN 1 THEN substring(words[1], 1, 4)
    WHEN 2 THEN substring(words[1], 1, 3) || substring(words[2], 1, 1)
    WHEN 3 THEN substring(words[1], 1, 2) || substring(words[2], 1, 1) || substring(words[3], 1, 1)
    ELSE        substring(words[1], 1, 1) || substring(words[2], 1, 1) || substring(words[3], 1, 1) || substring(words[4], 1, 1)
  END);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 2. Conflict-safe wrapper: appends 2, 3, … if code already taken ─────────

CREATE OR REPLACE FUNCTION generate_unique_client_code(client_name TEXT, exclude_id UUID)
RETURNS TEXT AS $$
DECLARE
  base  TEXT := generate_client_code(client_name);
  code  TEXT := base;
  n     INT  := 2;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM clients WHERE client_code = code AND id IS DISTINCT FROM exclude_id
  ) LOOP
    -- Keep 3 chars of base + counter digit(s) to stay at ≤5 chars
    code := substring(base, 1, 3) || n::TEXT;
    n    := n + 1;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Trigger function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_generate_client_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate client_code only when name is present and code not yet set
  IF NEW.name IS NOT NULL AND NEW.name <> ''
     AND (NEW.client_code IS NULL OR NEW.client_code = '') THEN
    NEW.client_code := generate_unique_client_code(NEW.name, NEW.id);
  END IF;

  -- Generate calendar_webhook_token only when not yet set and code is known
  IF (NEW.calendar_webhook_token IS NULL OR NEW.calendar_webhook_token = '')
     AND NEW.client_code IS NOT NULL THEN
    NEW.calendar_webhook_token :=
      lower(NEW.client_code) || '-' || encode(gen_random_bytes(4), 'hex');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Attach trigger (BEFORE INSERT so fields are set before the row lands) ─

DROP TRIGGER IF EXISTS trg_auto_generate_client_fields ON clients;

CREATE TRIGGER trg_auto_generate_client_fields
  BEFORE INSERT OR UPDATE OF name
  ON clients
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_client_fields();
