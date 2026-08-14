-- Check if an email is already used (profiles and/or auth.users).
-- Used at signup so the app can show a clear message instead of a fake “Account created”.

CREATE OR REPLACE FUNCTION public.email_already_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(trim(p.email)) = lower(trim(p_email))
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE lower(u.email) = lower(trim(p_email))
    );
$$;

REVOKE ALL ON FUNCTION public.email_already_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_already_registered(text) TO anon;
GRANT EXECUTE ON FUNCTION public.email_already_registered(text) TO authenticated;

COMMENT ON FUNCTION public.email_already_registered(text) IS
  'Returns true if email exists in profiles or auth.users (signup duplicate check).';
