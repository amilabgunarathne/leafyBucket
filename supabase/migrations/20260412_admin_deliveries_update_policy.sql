-- Admin dashboard: change delivery status (open, locked, delivered, skipped, cancelled).
-- delivered_at: optional timestamp when the box was fulfilled.

ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Admins can update all deliveries" ON public.deliveries;
CREATE POLICY "Admins can update all deliveries"
  ON public.deliveries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON POLICY "Admins can update all deliveries" ON public.deliveries IS
  'Admin can set status and delivered_at on any delivery row.';
