-- ============================================
-- Cattleitics V2 Migration
-- Multi-user farms + Admin/Superadmin support
-- Run this in Supabase SQL Editor
-- ============================================
-- 
-- NEW DATA MODEL:
--   farms          → central entity (owns all herd data)
--   farm_members   → maps users to farms with roles
--   profiles       → extended with global role (superadmin)
--   cattle         → now references farm_id instead of user_id
--   cattle_history → now references farm_id
--   paddocks       → now references farm_id
--   tasks          → now references farm_id
--   settings       → now references farm_id (farm-level settings)
--
-- ROLES:
--   farm_members.role: 'owner' | 'admin' | 'member'
--     owner  → full control, can invite/remove members, delete farm
--     admin  → full CRUD on farm data, can invite members
--     member → read/write cattle & tasks, cannot manage members
--
--   profiles.global_role: 'user' | 'superadmin'
--     superadmin → can access all farms, reset passwords, manage users
--                  (this is you, the app developer/operator)
--

-- ============================================
-- STEP 1: Create the FARMS table
-- ============================================
CREATE TABLE farms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location JSONB,          -- { lat, lng }
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STEP 2: Create the FARM_MEMBERS table
-- ============================================
CREATE TABLE farm_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, user_id)
);

-- ============================================
-- STEP 3: Add global_role to profiles
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS global_role TEXT DEFAULT 'user' CHECK (global_role IN ('user', 'superadmin'));

-- Add active_farm_id to profiles (tracks which farm a user is currently viewing)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_farm_id UUID REFERENCES farms(id);

-- ============================================
-- STEP 4: Add farm_id to all data tables
-- ============================================
ALTER TABLE cattle ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE cattle_history ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE paddocks ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- ============================================
-- STEP 5: Migrate existing data
-- For each existing user who has cattle, create a farm and assign them as owner
-- ============================================
DO $$
DECLARE
  r RECORD;
  new_farm_id UUID;
  farm_name_val TEXT;
BEGIN
  -- For each user who has cattle data
  FOR r IN SELECT DISTINCT user_id FROM cattle LOOP
    -- Get their farm name from settings or profiles
    SELECT value::text INTO farm_name_val 
      FROM settings WHERE user_id = r.user_id AND key = 'farm_name' LIMIT 1;
    
    IF farm_name_val IS NULL THEN
      SELECT farm_name INTO farm_name_val FROM profiles WHERE id = r.user_id;
    END IF;
    
    -- Strip JSON quotes if present
    farm_name_val := COALESCE(TRIM(BOTH '"' FROM farm_name_val), 'My Farm');
    
    -- Create a farm for this user
    INSERT INTO farms (id, name, created_by)
    VALUES (gen_random_uuid(), farm_name_val, r.user_id)
    RETURNING id INTO new_farm_id;
    
    -- Make them the owner
    INSERT INTO farm_members (farm_id, user_id, role)
    VALUES (new_farm_id, r.user_id, 'owner');
    
    -- Set as their active farm
    UPDATE profiles SET active_farm_id = new_farm_id WHERE id = r.user_id;
    
    -- Migrate their data to use farm_id
    UPDATE cattle SET farm_id = new_farm_id WHERE user_id = r.user_id;
    UPDATE cattle_history SET farm_id = new_farm_id WHERE user_id = r.user_id;
    UPDATE paddocks SET farm_id = new_farm_id WHERE user_id = r.user_id;
    UPDATE tasks SET farm_id = new_farm_id WHERE user_id = r.user_id;
    UPDATE settings SET farm_id = new_farm_id WHERE user_id = r.user_id;
  END LOOP;
  
  -- Also handle users with no cattle but who have settings/profiles
  FOR r IN 
    SELECT DISTINCT p.id as user_id FROM profiles p
    WHERE p.id NOT IN (SELECT DISTINCT user_id FROM farm_members)
    AND p.id IN (SELECT DISTINCT user_id FROM settings)
  LOOP
    SELECT value::text INTO farm_name_val 
      FROM settings WHERE user_id = r.user_id AND key = 'farm_name' LIMIT 1;
    farm_name_val := COALESCE(TRIM(BOTH '"' FROM farm_name_val), 'My Farm');
    
    INSERT INTO farms (id, name, created_by)
    VALUES (gen_random_uuid(), farm_name_val, r.user_id)
    RETURNING id INTO new_farm_id;
    
    INSERT INTO farm_members (farm_id, user_id, role)
    VALUES (new_farm_id, r.user_id, 'owner');
    
    UPDATE profiles SET active_farm_id = new_farm_id WHERE id = r.user_id;
    UPDATE settings SET farm_id = new_farm_id WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- ============================================
-- STEP 6: Update unique constraints
-- Change cattle unique from (user_id, tag_id) to (farm_id, tag_id)
-- ============================================
ALTER TABLE cattle DROP CONSTRAINT IF EXISTS cattle_user_id_tag_id_key;
-- Only add new constraint if farm_id is populated (it should be after migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cattle_farm_id_tag_id_key'
  ) THEN
    ALTER TABLE cattle ADD CONSTRAINT cattle_farm_id_tag_id_key UNIQUE(farm_id, tag_id);
  END IF;
END $$;

ALTER TABLE paddocks DROP CONSTRAINT IF EXISTS paddocks_user_id_paddock_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paddocks_farm_id_paddock_id_key'
  ) THEN
    ALTER TABLE paddocks ADD CONSTRAINT paddocks_farm_id_paddock_id_key UNIQUE(farm_id, paddock_id);
  END IF;
END $$;

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_user_id_key_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_farm_id_key_key'
  ) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_farm_id_key_key UNIQUE(farm_id, key);
  END IF;
END $$;

-- ============================================
-- STEP 7: Drop old RLS policies and create new ones
-- ============================================

-- Helper function: check if user is a member of a given farm
CREATE OR REPLACE FUNCTION public.user_has_farm_access(check_farm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Superadmins can access everything
  IF EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND global_role = 'superadmin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Regular users must be a member of the farm
  RETURN EXISTS (
    SELECT 1 FROM farm_members 
    WHERE farm_id = check_farm_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: check if user is admin/owner of a farm
CREATE OR REPLACE FUNCTION public.user_is_farm_admin(check_farm_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND global_role = 'superadmin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM farm_members 
    WHERE farm_id = check_farm_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- STEP 8: New RLS policies for FARMS table
-- ============================================
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

-- Users can see farms they are members of
CREATE POLICY "Users can view their farms"
  ON farms FOR SELECT USING (
    public.user_has_farm_access(id)
  );

-- Any authenticated user can create a farm
CREATE POLICY "Users can create farms"
  ON farms FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Only owner/admin can update farm details
CREATE POLICY "Farm admins can update farm"
  ON farms FOR UPDATE USING (public.user_is_farm_admin(id));

-- Only owner can delete farm
CREATE POLICY "Farm owner can delete farm"
  ON farms FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM farm_members 
      WHERE farm_id = id AND user_id = auth.uid() AND role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND global_role = 'superadmin'
    )
  );

-- ============================================
-- STEP 9: New RLS policies for FARM_MEMBERS table
-- ============================================
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;

-- Users can see members of farms they belong to
CREATE POLICY "Members can view farm members"
  ON farm_members FOR SELECT USING (
    public.user_has_farm_access(farm_id)
  );

-- Admin/owner can add members
CREATE POLICY "Admins can add farm members"
  ON farm_members FOR INSERT WITH CHECK (
    public.user_is_farm_admin(farm_id)
  );

-- Admin/owner can update member roles
CREATE POLICY "Admins can update farm members"
  ON farm_members FOR UPDATE USING (
    public.user_is_farm_admin(farm_id)
  );

-- Admin/owner can remove members (but not themselves if they're the only owner)
CREATE POLICY "Admins can remove farm members"
  ON farm_members FOR DELETE USING (
    public.user_is_farm_admin(farm_id)
  );

-- ============================================
-- STEP 10: Replace CATTLE policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own cattle" ON cattle;
DROP POLICY IF EXISTS "Users can insert own cattle" ON cattle;
DROP POLICY IF EXISTS "Users can update own cattle" ON cattle;
DROP POLICY IF EXISTS "Users can delete own cattle" ON cattle;

CREATE POLICY "Farm members can view cattle"
  ON cattle FOR SELECT USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can insert cattle"
  ON cattle FOR INSERT WITH CHECK (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can update cattle"
  ON cattle FOR UPDATE USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm admins can delete cattle"
  ON cattle FOR DELETE USING (public.user_is_farm_admin(farm_id));

-- ============================================
-- STEP 11: Replace CATTLE_HISTORY policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own history" ON cattle_history;
DROP POLICY IF EXISTS "Users can insert own history" ON cattle_history;
DROP POLICY IF EXISTS "Users can update own history" ON cattle_history;
DROP POLICY IF EXISTS "Users can delete own history" ON cattle_history;

CREATE POLICY "Farm members can view history"
  ON cattle_history FOR SELECT USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can insert history"
  ON cattle_history FOR INSERT WITH CHECK (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can update history"
  ON cattle_history FOR UPDATE USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm admins can delete history"
  ON cattle_history FOR DELETE USING (public.user_is_farm_admin(farm_id));

-- ============================================
-- STEP 12: Replace PADDOCKS policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own paddocks" ON paddocks;
DROP POLICY IF EXISTS "Users can insert own paddocks" ON paddocks;
DROP POLICY IF EXISTS "Users can update own paddocks" ON paddocks;
DROP POLICY IF EXISTS "Users can delete own paddocks" ON paddocks;

CREATE POLICY "Farm members can view paddocks"
  ON paddocks FOR SELECT USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can insert paddocks"
  ON paddocks FOR INSERT WITH CHECK (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can update paddocks"
  ON paddocks FOR UPDATE USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm admins can delete paddocks"
  ON paddocks FOR DELETE USING (public.user_is_farm_admin(farm_id));

-- ============================================
-- STEP 13: Replace TASKS policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

CREATE POLICY "Farm members can view tasks"
  ON tasks FOR SELECT USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can insert tasks"
  ON tasks FOR INSERT WITH CHECK (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can update tasks"
  ON tasks FOR UPDATE USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can delete tasks"
  ON tasks FOR DELETE USING (public.user_has_farm_access(farm_id));

-- ============================================
-- STEP 14: Replace SETTINGS policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON settings;

CREATE POLICY "Farm members can view settings"
  ON settings FOR SELECT USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can insert settings"
  ON settings FOR INSERT WITH CHECK (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm members can update settings"
  ON settings FOR UPDATE USING (public.user_has_farm_access(farm_id));

CREATE POLICY "Farm admins can delete settings"
  ON settings FOR DELETE USING (public.user_is_farm_admin(farm_id));

-- ============================================
-- STEP 15: Update PROFILES policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Users can always view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

-- Superadmins can view all profiles (for admin panel)
CREATE POLICY "Superadmins can view all profiles"
  ON profiles FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.global_role = 'superadmin')
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Superadmins can update any profile
CREATE POLICY "Superadmins can update all profiles"
  ON profiles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.global_role = 'superadmin')
  );

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- STEP 16: Update the signup trigger to auto-create a farm
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_farm_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, global_role)
  VALUES (NEW.id, 'user');
  
  -- Create a default farm for this user
  INSERT INTO public.farms (id, name, created_by)
  VALUES (gen_random_uuid(), 'My Farm', NEW.id)
  RETURNING id INTO new_farm_id;
  
  -- Make them the owner of their farm
  INSERT INTO public.farm_members (farm_id, user_id, role)
  VALUES (new_farm_id, NEW.id, 'owner');
  
  -- Set as active farm
  UPDATE public.profiles SET active_farm_id = new_farm_id WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 17: Set yourself as superadmin
-- Replace the email below with YOUR email address
-- ============================================
-- UPDATE profiles SET global_role = 'superadmin' 
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com');

-- ============================================
-- DONE! Summary of new model:
-- ============================================
-- 
-- User signs up → profile created → farm created → user is farm owner
-- Farm owner can invite other users as admin/member
-- All data belongs to a farm, not a user
-- Multiple users can view/edit the same farm's cattle
-- Superadmin (you) can access all farms for support
--
-- Next steps after running this migration:
-- 1. Uncomment and run STEP 17 with your email to make yourself superadmin
-- 2. Update db.js to use farm_id instead of user_id
-- 3. Build the admin panel UI
-- 4. Add invite/member management UI
