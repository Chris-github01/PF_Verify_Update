# User Setup Instructions for Verify+

## Organization Created ✅
- **Organization**: Optimal Fire
- **ID**: `1133b7a9-811d-41b4-b34f-cad5f8f88ce9`

## Users to Create

### User 1: Chris
- **Email**: chris@optimalfire.co.nz
- **Password**: 131188
- **Role**: Owner

### User 2: Pieter
- **Email**: pieter@optimalfire.co.nz
- **Password**: OptFire@42
- **Role**: Admin

---

## Setup Method 1: Via Supabase Dashboard (Easiest)

### Step 1: Create Users

1. Go to: https://fkhozhrxeofudpfwziyj.supabase.co
2. Navigate to: **Authentication** → **Users**
3. Click: **Add User** → **Create New User**

**For Chris:**
- Email: `chris@optimalfire.co.nz`
- Password: `131188`
- ✅ Check **"Auto Confirm User"**
- Click **Create User**
- **Copy the User ID** (you'll need it)

**For Pieter:**
- Email: `pieter@optimalfire.co.nz`
- Password: `OptFire@42`
- ✅ Check **"Auto Confirm User"**
- Click **Create User**
- **Copy the User ID** (you'll need it)

### Step 2: Add Users to Organization

Go to **SQL Editor** and run this (replace the user IDs):

```sql
-- Add Chris as Owner
INSERT INTO organisation_members (organisation_id, user_id, role, status)
VALUES (
  '1133b7a9-811d-41b4-b34f-cad5f8f88ce9',
  '<chris-user-id-from-dashboard>',
  'owner',
  'active'
);

-- Add Pieter as Admin
INSERT INTO organisation_members (organisation_id, user_id, role, status)
VALUES (
  '1133b7a9-811d-41b4-b34f-cad5f8f88ce9',
  '<pieter-user-id-from-dashboard>',
  'admin',
  'active'
);
```

---

## Setup Method 2: Via SQL (All at Once)

If you have Supabase service role key, run this SQL:

```sql
-- This requires service_role privileges
-- Get or create users and add to org

DO $$
DECLARE
  chris_user_id uuid;
  pieter_user_id uuid;
  org_id uuid := '1133b7a9-811d-41b4-b34f-cad5f8f88ce9';
BEGIN
  -- Check if users exist in auth.users
  SELECT id INTO chris_user_id FROM auth.users WHERE email = 'chris@optimalfire.co.nz';
  SELECT id INTO pieter_user_id FROM auth.users WHERE email = 'pieter@optimalfire.co.nz';
  
  -- If users exist, add them to organization
  IF chris_user_id IS NOT NULL THEN
    INSERT INTO organisation_members (organisation_id, user_id, role, status)
    VALUES (org_id, chris_user_id, 'owner', 'active')
    ON CONFLICT (organisation_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Added Chris to organization';
  ELSE
    RAISE NOTICE 'Chris user not found - create via Dashboard first';
  END IF;
  
  IF pieter_user_id IS NOT NULL THEN
    INSERT INTO organisation_members (organisation_id, user_id, role, status)
    VALUES (org_id, pieter_user_id, 'admin', 'active')
    ON CONFLICT (organisation_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Added Pieter to organization';
  ELSE
    RAISE NOTICE 'Pieter user not found - create via Dashboard first';
  END IF;
END $$;
```

---

## Setup Method 3: Via cURL (Using Supabase API)

```bash
# Set your Supabase project details
SUPABASE_URL="https://fkhozhrxeofudpfwziyj.supabase.co"
SERVICE_ROLE_KEY="<your-service-role-key>"

# Create Chris
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chris@optimalfire.co.nz",
    "password": "131188",
    "email_confirm": true,
    "user_metadata": {
      "full_name": "Chris"
    }
  }'

# Create Pieter
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pieter@optimalfire.co.nz",
    "password": "OptFire@42",
    "email_confirm": true,
    "user_metadata": {
      "full_name": "Pieter"
    }
  }'
```

---

## Verification

After setup, verify everything works:

```sql
-- Check users exist
SELECT id, email, created_at 
FROM auth.users 
WHERE email IN ('chris@optimalfire.co.nz', 'pieter@optimalfire.co.nz');

-- Check organization membership
SELECT 
  om.role,
  om.status,
  u.email,
  o.name as organisation_name
FROM organisation_members om
JOIN auth.users u ON u.id = om.user_id
JOIN organisations o ON o.id = om.organisation_id
WHERE o.id = '1133b7a9-811d-41b4-b34f-cad5f8f88ce9';
```

Expected output:
```
role   | status | email                      | organisation_name
-------|--------|----------------------------|------------------
owner  | active | chris@optimalfire.co.nz    | Optimal Fire
admin  | active | pieter@optimalfire.co.nz   | Optimal Fire
```

---

## Test Login

After setup complete, test login:

1. Go to: http://localhost:5173 (or your app URL)
2. Enter credentials:
   - Chris: `chris@optimalfire.co.nz` / `131188`
   - Pieter: `pieter@optimalfire.co.nz` / `OptFire@42`
3. Should successfully log in and see Optimal Fire organization

---

## Troubleshooting

### Issue: "Invalid login credentials"
- Ensure users were created with "Auto Confirm User" checked
- Check email confirmation status in Dashboard

### Issue: "No organization found"
- Run the verification SQL above
- Ensure organisation_members records exist

### Issue: Users can't see any data
- Check RLS policies are enabled
- Verify organisation_members status is 'active'

---

## Quick Command Reference

```sql
-- List all users
SELECT email, created_at, confirmed_at FROM auth.users;

-- List organization members
SELECT u.email, om.role, om.status 
FROM organisation_members om
JOIN auth.users u ON u.id = om.user_id
WHERE om.organisation_id = '1133b7a9-811d-41b4-b34f-cad5f8f88ce9';

-- Update user role
UPDATE organisation_members 
SET role = 'owner' 
WHERE user_id = '<user-id>';

-- Make user platform admin
INSERT INTO platform_admins (user_id, is_active)
VALUES ('<user-id>', true);
```

---

## Status

- [x] Base schema created
- [x] Organization "Optimal Fire" created
- [ ] Create Chris user in Supabase Dashboard
- [ ] Create Pieter user in Supabase Dashboard  
- [ ] Add both users to organization
- [ ] Test login for both users
- [ ] Verify organization access

**Next Step**: Create the users via Supabase Dashboard → Authentication → Users
