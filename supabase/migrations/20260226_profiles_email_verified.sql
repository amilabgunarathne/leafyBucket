-- Track email verification in profiles: false until user confirms signup/email change.
-- auth.users are created before confirmation; this keeps profiles.email_verified in sync.

-- 1) Add column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- 2) Backfill: mark existing users as verified if auth already has them confirmed
UPDATE public.profiles p
SET email_verified = true
FROM auth.users u
WHERE p.id = u.id AND u.email_confirmed_at IS NOT NULL;

-- 3) New user signup: set email_verified from auth at insert time
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.email_confirmed_at IS NOT NULL)
  );
  RETURN NEW;
END;
$$;

-- 4) When user confirms email (signup or email change), set profiles.email_verified = true
CREATE OR REPLACE FUNCTION public.set_profile_email_verified_on_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
    SET email_verified = true,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_profile_email_verified_on_confirm();
