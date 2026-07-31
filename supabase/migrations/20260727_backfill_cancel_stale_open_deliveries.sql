-- One-time / re-runnable: cancel ALL stale open deliveries (every subscriber),
-- not only the logged-in user. Creating the RPC alone does not change any rows.
--
-- Stale = status open AND scheduled_date before this week's Monday (Asia/Colombo).
-- Re-run safely: already-cancelled rows are skipped.

UPDATE public.deliveries d
SET status = 'cancelled'
WHERE d.status = 'open'
  AND d.scheduled_date < (date_trunc('week', timezone('Asia/Colombo', now()))::date);

NOTIFY pgrst, 'reload schema';
