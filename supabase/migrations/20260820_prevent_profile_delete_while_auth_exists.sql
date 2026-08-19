-- Block accidental DELETE/TRUNCATE on public.profiles while auth.users still has the row.
-- Full account removal: delete dependents, then DELETE FROM auth.users — profiles cascade
-- (profiles.id REFERENCES auth.users(id) ON DELETE CASCADE). PostgreSQL runs that cascade
-- AFTER the auth row is gone, so this trigger allows it.

CREATE OR REPLACE FUNCTION public.prevent_profile_delete_while_auth_user_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.id) THEN
    RAISE EXCEPTION
      'Cannot delete public.profiles (id=%) while auth.users still exists. Delete the auth user after clearing FKs (subscriptions, etc.); the profile is removed by ON DELETE CASCADE.',
      OLD.id
      USING ERRCODE = 'P0001',
            HINT = 'Do not delete profiles alone. Use Auth user delete or the helper in 20260818_diagnose_auth_user_delete.sql (auth.users last).';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_delete_while_auth_user_exists ON public.profiles;
CREATE TRIGGER prevent_profile_delete_while_auth_user_exists
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_profile_delete_while_auth_user_exists();

CREATE OR REPLACE FUNCTION public.prevent_profiles_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'TRUNCATE public.profiles is not allowed. Delete auth.users instead; profile rows cascade.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS prevent_profiles_truncate ON public.profiles;
CREATE TRIGGER prevent_profiles_truncate
  BEFORE TRUNCATE ON public.profiles
  FOR EACH STATEMENT
  EXECUTE PROCEDURE public.prevent_profiles_truncate();

REVOKE ALL ON FUNCTION public.prevent_profile_delete_while_auth_user_exists() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_profiles_truncate() FROM PUBLIC;

COMMENT ON FUNCTION public.prevent_profile_delete_while_auth_user_exists() IS
  'BEFORE DELETE on profiles: refuse if matching auth.users row still exists.';

COMMENT ON TABLE public.profiles IS
  'App profile for auth.users.id. Do not DELETE this table directly; remove the auth user (cascade) after clearing other FKs.';
