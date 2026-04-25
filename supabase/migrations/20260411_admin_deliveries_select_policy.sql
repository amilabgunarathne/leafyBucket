-- Allow admins to list all deliveries (e.g. weekly ship list in Admin UI).
-- Safe to run if RLS is already enabled on public.deliveries.

DROP POLICY IF EXISTS "Admins can view all deliveries" ON public.deliveries;
CREATE POLICY "Admins can view all deliveries"
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON POLICY "Admins can view all deliveries" ON public.deliveries IS
  'Admin dashboard: query deliveries across all subscribers (e.g. this week ship list).';
