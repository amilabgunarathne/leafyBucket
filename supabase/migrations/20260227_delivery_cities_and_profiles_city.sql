-- Delivery cities: available and not available. City selection required at signup.
-- Add city to profiles; store notify requests for unavailable cities.

-- 1) Add city to profiles (delivery city selected at signup)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

-- 2) Table of delivery cities (available = we deliver there)
CREATE TABLE IF NOT EXISTS public.delivery_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Seed available cities (Sri Lanka delivery areas)
INSERT INTO public.delivery_cities (name, available) VALUES
  ('Bambalapitiya', true),
  ('Bloemendhal', true),
  ('Borella', true),
  ('Cinnamon Gardens', true),
  ('Dematagoda', true),
  ('Fort (Colombo)', true),
  ('Grandpass', true),
  ('Havelock Town', true),
  ('Hulftsdorp', true),
  ('Kirulapone', true),
  ('Kirulapone North', true),
  ('Kollupitiya', true),
  ('Kotahena', true),
  ('Kohuwala', true),
  ('Madampitiya', true),
  ('Maligawatta', true),
  ('Maradana', true),
  ('Mattakkuliya', true),
  ('Modara', true),
  ('Narahenpita', true),
  ('Pamankada', true),
  ('Panchikawatte', true),
  ('Pettah', true),
  ('Slave Island', true),
  ('Union Place', true),
  ('Wellawatte', true),
  ('Nawala', true),
  ('Nugegoda', true),
  ('Rajagiriya', true),
  ('Welikada', true),
  ('Dehiwala', true),
  ('Kalubowila', true),
  ('Mount Lavinia', true),
  ('Ratmalana', true),
  ('Angoda', true),
  ('Battaramulla', true),
  ('Gothatuwa', true),
  ('Homagama', true),
  ('Ja-Ela', true),
  ('Kaduwela', true),
  ('Kelaniya', true),
  ('Kolonnawa', true),
  ('Koswatte', true),
  ('Kotikawatta', true),
  ('Kottawa', true),
  ('Maharagama', true),
  ('Malabe', true),
  ('Moratuwa', true),
  ('Mulleriyawa', true),
  ('Pannipitiya', true),
  ('Peliyagoda', true),
  ('Piliyandala', true),
  ('Ragama', true),
  ('Thalawathugoda', true),
  ('Wattala', true),
  ('Wickramasinghapura', true),
  ('Jaffna', false),
  ('Anuradhapura', false),
  ('Polonnaruwa', false),
  ('Dambulla', false)
ON CONFLICT (name) DO NOTHING;

-- 3) Notify requests when user picks a city we don't deliver to yet
CREATE TABLE IF NOT EXISTS public.delivery_notify_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  city_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.delivery_notify_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a notify request (no auth required)
CREATE POLICY "Allow insert delivery notify requests"
  ON public.delivery_notify_requests FOR INSERT
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can view delivery notify requests"
  ON public.delivery_notify_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4) Delivery cities: public read
ALTER TABLE public.delivery_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery cities are public for read"
  ON public.delivery_cities FOR SELECT
  USING (true);

-- 5) handle_new_user: include city from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, email_verified, city)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    (NEW.email_confirmed_at IS NOT NULL),
    NEW.raw_user_meta_data->>'city'
  );
  RETURN NEW;
END;
$$;
