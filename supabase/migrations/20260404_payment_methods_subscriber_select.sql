-- Subscribers must be able to read the payment_methods row tied to their subscription,
-- including when is_enabled = false (otherwise embed/lookup returns null and UI shows "Unknown method").

CREATE POLICY "Subscribers can read own subscription payment method"
  ON public.payment_methods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.payment_method_id = payment_methods.id
        AND s.user_id = auth.uid()
    )
  );
