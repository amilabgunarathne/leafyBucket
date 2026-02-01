-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view/edit their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Profiles: Admins can view/edit all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan TEXT CHECK (plan IN ('small', 'medium', 'large')),
  status TEXT CHECK (status IN ('active', 'paused', 'cancelled')) DEFAULT 'active',
  next_delivery DATE,
  customizations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Users can view/edit their own subscription
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscriptions: Admins can view/edit all
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update all subscriptions" ON public.subscriptions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create vegetables table
CREATE TABLE public.vegetables (
  id TEXT PRIMARY KEY, -- Utilizing existing ID format like 'carrot', 'leeks'
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('root', 'leafy', 'bushy')),
  base_value INTEGER,
  typical_weight TEXT,
  market_price_per_250g INTEGER,
  description TEXT,
  season TEXT,
  benefits TEXT[],
  image TEXT,
  weight_per_value_point INTEGER,
  is_available BOOLEAN DEFAULT true,
  nutrition_score INTEGER DEFAULT 8,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS for vegetables
ALTER TABLE public.vegetables ENABLE ROW LEVEL SECURITY;

-- Vegetables: Public read access
CREATE POLICY "Vegetables are public for viewing" ON public.vegetables
  FOR SELECT USING (true);

-- Vegetables: Admins can insert/update/delete
CREATE POLICY "Admins can manage vegetables" ON public.vegetables
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger to handle new user signup automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', 'New User'),
    COALESCE(new.raw_user_meta_data->>'role', 'user')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Insert some default vegetables (Sample Data)
INSERT INTO public.vegetables (id, name, category, base_value, typical_weight, market_price_per_250g, description, season, benefits, image, weight_per_value_point, is_available)
VALUES
('carrots', 'Organic Carrots', 'root', 2, '500g', 350, 'Sweet and crunchy organic carrots, rich in beta-carotene.', 'Year-round', ARRAY['Improves vision', 'Boosts immunity'], 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&q=80&w=800', 250, true),
('leeks', 'Leeks (Lunu Kola)', 'leafy', 2, '250g', 280, 'Fresh leeks perfect for soups and stir-fries.', 'Year-round', ARRAY['Heart health', 'Digestion'], 'https://images.unsplash.com/photo-1603048297172-c92544798d5e?auto=format&fit=crop&q=80&w=800', 125, true),
('gherkin', 'Fresh Gherkin', 'bushy', 1, '300g', 200, 'Crunchy gherkins, great for pickling or curries.', 'Seasonal', ARRAY['Hydration', 'Low calorie'], 'https://images.unsplash.com/photo-1563207797-152e07eb54f3?auto=format&fit=crop&q=80&w=800', 300, true);
