-- Sync auth.users email to public.profiles when user confirms a new email (e.g. after updateUser({ email })).
-- Supabase Auth updates auth.users when the user clicks the confirmation link; this trigger keeps profiles in sync.

CREATE OR REPLACE FUNCTION public.sync_auth_email_to_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users so profile email stays in sync after email change confirmation
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_auth_email_to_profiles();
