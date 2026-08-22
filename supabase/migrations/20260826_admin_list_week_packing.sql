-- Admin packing list must see ALL customers' deliveries for a week.
-- Client-side selects are subject to RLS; without a working admin policy the UI only
-- shows the logged-in admin's own pack. This SECURITY DEFINER RPC is the source of truth.

CREATE OR REPLACE FUNCTION public.admin_list_week_packing(
  p_week_start date,
  p_week_end date,
  p_include_hidden boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deliveries jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end < p_week_start THEN
    RAISE EXCEPTION 'Invalid week range';
  END IF;

  SELECT COALESCE(
    jsonb_agg(r.row_data ORDER BY r.sort_date, r.sort_name),
    '[]'::jsonb
  )
  INTO v_deliveries
  FROM (
    SELECT
      d.scheduled_date AS sort_date,
      COALESCE(NULLIF(trim(pr.full_name), ''), COALESCE(pr.email, '')) AS sort_name,
      jsonb_build_object(
        'delivery_id', d.id,
        'scheduled_date', d.scheduled_date,
        'status', d.status::text,
        'delivery_index', d.delivery_index,
        'subscription_id', d.subscription_id,
        'subscription_status', s.status::text,
        'user_id', s.user_id,
        'customer_name', COALESCE(NULLIF(trim(pr.full_name), ''), '—'),
        'email', COALESCE(pr.email, '—'),
        'address_line', COALESCE(NULLIF(trim(pr.address), ''), '—'),
        'city', COALESCE(NULLIF(trim(pr.city), ''), '—'),
        'bucket_name', COALESCE(bt.name, '—'),
        'payment_label', CASE
          WHEN pm.id IS NULL THEN 'Not set'
          ELSE COALESCE(NULLIF(trim(pm.name), ''), pm.code, 'Not set')
        END,
        'items', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', di.id,
                'vegetable_id', di.vegetable_id,
                'vegetable_name', COALESCE(v.name, di.vegetable_id),
                'weight', di.weight,
                'is_substituted', COALESCE(di.is_substituted, false)
              )
              ORDER BY COALESCE(v.name, di.vegetable_id)
            )
            FROM public.delivery_items di
            LEFT JOIN public.vegetables v ON v.id = di.vegetable_id
            WHERE di.delivery_id = d.id
          ),
          '[]'::jsonb
        )
      ) AS row_data
    FROM public.deliveries d
    INNER JOIN public.subscriptions s ON s.id = d.subscription_id
    LEFT JOIN public.profiles pr ON pr.id = s.user_id
    LEFT JOIN public.bucket_types bt ON bt.id = s.bucket_type_id
    LEFT JOIN public.payment_methods pm ON pm.id = s.payment_method_id
    WHERE d.scheduled_date::date >= p_week_start
      AND d.scheduled_date::date <= p_week_end
      AND (
        p_include_hidden
        OR d.status::text NOT IN ('paused', 'skipped', 'cancelled')
      )
      AND (
        p_include_hidden
        OR s.status::text IS DISTINCT FROM 'paused'
      )
  ) r;

  RETURN jsonb_build_object(
    'ok', true,
    'week_start', p_week_start,
    'week_end', p_week_end,
    'count', jsonb_array_length(COALESCE(v_deliveries, '[]'::jsonb)),
    'deliveries', COALESCE(v_deliveries, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_list_week_packing(date, date, boolean) IS
  'Admin packing list for a Mon–Sun week. SECURITY DEFINER so RLS cannot hide other customers.';

REVOKE ALL ON FUNCTION public.admin_list_week_packing(date, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_week_packing(date, date, boolean) TO authenticated;

-- Re-assert admin read on deliveries (belt-and-suspenders with the RPC)
DROP POLICY IF EXISTS "Admins can view all deliveries" ON public.deliveries;
CREATE POLICY "Admins can view all deliveries"
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
