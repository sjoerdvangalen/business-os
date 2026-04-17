-- Add sourcing approval states to strategy_approval enum
-- Pipeline: external_approved → sourcing_pending → sourcing_approved/rejected → messaging_approved
ALTER TYPE strategy_approval ADD VALUE IF NOT EXISTS 'sourcing_pending';
ALTER TYPE strategy_approval ADD VALUE IF NOT EXISTS 'sourcing_approved';
ALTER TYPE strategy_approval ADD VALUE IF NOT EXISTS 'sourcing_rejected';
ALTER TYPE strategy_approval ADD VALUE IF NOT EXISTS 'messaging_pending';
