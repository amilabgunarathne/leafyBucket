-- Abort all auth sessions for a user when they request a password reset.
-- Safe to call for unknown emails (returns ok without revealing existence).

CREATE OR REPLACE FUNCTION public.abort_sessions_for_password_reset(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT id INTO uid
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Prefer sessions table (cascades / links refresh tokens in modern GoTrue)
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = uid;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- Also clear refresh tokens when user_id column exists
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = uid;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.abort_sessions_for_password_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abort_sessions_for_password_reset(text) TO anon, authenticated;

COMMENT ON FUNCTION public.abort_sessions_for_password_reset(text) IS
  'Revokes all refresh tokens/sessions for the given email after a password-reset request.';
