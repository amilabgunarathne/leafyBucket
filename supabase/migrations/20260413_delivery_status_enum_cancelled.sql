-- deliveries.status uses enum delivery_status_enum; add 'cancelled' for admin workflow.
-- ADD VALUE IF NOT EXISTS: PostgreSQL 15+ (Supabase default). Idempotent.
-- Do not wrap in DO/plpgsql — ALTER TYPE ADD VALUE cannot run inside a function block.

ALTER TYPE public.delivery_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
