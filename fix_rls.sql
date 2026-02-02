-- Fix Infinite Recursion in RLS Policies

-- 1. Create a secure function to check admin status (bypasses RLS loop)
-- SECURITY DEFINER means this function runs with the privileges of the creator (you),
-- avoiding the recursive check on the profiles table.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the problematic recursive policies on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 3. Re-create policies using the new safe function
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    is_admin()
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    is_admin()
  );

-- 4. Update other tables to use the consistent helper function
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can update all subscriptions" ON public.subscriptions;

CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (
    is_admin()
  );

CREATE POLICY "Admins can update all subscriptions" ON public.subscriptions
  FOR UPDATE USING (
    is_admin()
  );

DROP POLICY IF EXISTS "Admins can manage vegetables" ON public.vegetables;

CREATE POLICY "Admins can manage vegetables" ON public.vegetables
  FOR ALL USING (
    is_admin()
  );
