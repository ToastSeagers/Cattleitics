-- ============================================
-- Cattleitics Database Setup
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  farm_name TEXT,
  owner_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Cattle table (one row per animal, per user)
CREATE TABLE cattle (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag_id TEXT NOT NULL,
  name TEXT,
  breed TEXT DEFAULT 'Nguni',
  gender TEXT DEFAULT 'Cow',
  dob TEXT,
  status TEXT DEFAULT 'Active',
  pregnant BOOLEAN DEFAULT FALSE,
  expected_calving_date TEXT,
  insemination_method TEXT,
  dam TEXT,
  sire TEXT,
  pasture TEXT,
  purchase_price NUMERIC,
  purchase_date TEXT,
  supplier TEXT,
  sale_price NUMERIC,
  sale_date TEXT,
  buyer TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag_id)
);

-- 3. Cattle history/events table
CREATE TABLE cattle_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cattle_id UUID REFERENCES cattle(id) ON DELETE CASCADE NOT NULL,
  date TEXT,
  type TEXT,
  description TEXT,
  performer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Paddocks table
CREATE TABLE paddocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  paddock_id TEXT NOT NULL,
  name TEXT,
  size TEXT,
  type TEXT,
  category TEXT,
  description TEXT,
  coordinates JSONB,
  UNIQUE(user_id, paddock_id)
);

-- 5. Tasks table
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  description TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  cattle_tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Settings table (key-value per user)
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  UNIQUE(user_id, key)
);

-- ============================================
-- Row Level Security (RLS) - each user only
-- sees their own data
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE paddocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Cattle: users can CRUD their own cattle
CREATE POLICY "Users can view own cattle"
  ON cattle FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cattle"
  ON cattle FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cattle"
  ON cattle FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cattle"
  ON cattle FOR DELETE USING (auth.uid() = user_id);

-- Cattle history: users can CRUD their own history
CREATE POLICY "Users can view own history"
  ON cattle_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history"
  ON cattle_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own history"
  ON cattle_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own history"
  ON cattle_history FOR DELETE USING (auth.uid() = user_id);

-- Paddocks: users can CRUD their own paddocks
CREATE POLICY "Users can view own paddocks"
  ON paddocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own paddocks"
  ON paddocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own paddocks"
  ON paddocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own paddocks"
  ON paddocks FOR DELETE USING (auth.uid() = user_id);

-- Tasks: users can CRUD their own tasks
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE USING (auth.uid() = user_id);

-- Settings: users can CRUD their own settings
CREATE POLICY "Users can view own settings"
  ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings"
  ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
  ON settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings"
  ON settings FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
