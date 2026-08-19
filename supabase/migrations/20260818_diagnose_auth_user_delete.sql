-- Helper (run manually in SQL editor) — not required for app deploy.
-- Fixes / diagnoses: Dashboard "Failed to delete selected users: Database error deleting user"
--
-- Cause: another table still references this auth.users id (or a trigger fails on delete).
-- Do not DELETE public.profiles first — a trigger blocks that while auth.users still exists
-- (see 20260820_prevent_profile_delete_while_auth_exists.sql). Remove dependents, then
-- DELETE auth.users; profiles.id ON DELETE CASCADE removes the profile.

-- =============================================================================
-- A) Find the auth user
-- =============================================================================
-- SELECT id, email, created_at FROM auth.users WHERE lower(email) = lower('you@example.com');

-- =============================================================================
-- B) See FK constraints that reference auth.users or profiles
-- =============================================================================
SELECT
  con.conrelid::regclass AS from_table,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND (
    con.confrelid = 'auth.users'::regclass
    OR con.confrelid = 'public.profiles'::regclass
  )
ORDER BY 1;

-- =============================================================================
-- C) Force-delete one user (replace UUID, then run this whole DO block)
-- =============================================================================
/*
DO $$
DECLARE
  v_uid uuid := 'PASTE_AUTH_USER_UUID_HERE'::uuid;
  v_sub_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_sub_ids
  FROM public.subscriptions WHERE user_id = v_uid;

  IF to_regclass('public.subscription_events') IS NOT NULL THEN
    DELETE FROM public.subscription_events
    WHERE user_id = v_uid OR actor_id = v_uid OR subscription_id = ANY (v_sub_ids);
  END IF;

  IF to_regclass('public.customisation_actions') IS NOT NULL THEN
    DELETE FROM public.customisation_actions ca
    USING public.deliveries d
    WHERE ca.delivery_id = d.id AND d.subscription_id = ANY (v_sub_ids);
  END IF;

  IF to_regclass('public.delivery_items') IS NOT NULL THEN
    DELETE FROM public.delivery_items di
    USING public.deliveries d
    WHERE di.delivery_id = d.id AND d.subscription_id = ANY (v_sub_ids);
  END IF;

  DELETE FROM public.deliveries WHERE subscription_id = ANY (v_sub_ids);

  UPDATE public.subscriptions
  SET previous_subscription_id = NULL
  WHERE user_id = v_uid OR previous_subscription_id = ANY (v_sub_ids);

  DELETE FROM public.subscriptions WHERE user_id = v_uid;
  -- Profile is removed by auth.users → profiles ON DELETE CASCADE (direct profile DELETE is blocked).
  DELETE FROM auth.users WHERE id = v_uid;

  RAISE NOTICE 'Deleted auth user %', v_uid;
END $$;
*/
