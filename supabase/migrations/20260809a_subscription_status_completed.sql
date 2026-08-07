-- Add subscription_status_enum value 'completed'.
-- Must commit before 20260809b uses this value (Postgres restriction).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'subscription_status_enum'
      AND e.enumlabel = 'completed'
  ) THEN
    ALTER TYPE public.subscription_status_enum ADD VALUE 'completed';
  END IF;
END $$;
