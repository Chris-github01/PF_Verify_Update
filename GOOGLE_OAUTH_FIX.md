# Google OAuth Connection Error - Fix Guide

## The Issue

When clicking "Continue with Google" on the login page, you're seeing:

```
fkhozhrxeofudpfwziyj.supabase.co refused to connect.
```

This error occurs because **Google OAuth is not yet configured** in your Supabase project settings.

## Root Cause

The application code is correctly implemented (see `GOOGLE_OAUTH_SETUP.md`), but the OAuth provider needs to be enabled and configured in two places:

1. **Google Cloud Console** - Create OAuth credentials
2. **Supabase Dashboard** - Enable Google provider with those credentials

## Quick Fix (Step-by-Step)

### Step 1: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services > OAuth consent screen**
4. Configure the consent screen:
   - App name: `VerifyTrade`
   - User support email: Your email
   - Authorized domains: Your domain
   - Scopes: `email`, `profile`, `openid`
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > OAuth client ID**
7. Select **Web application**
8. Add **Authorized redirect URIs**:
   ```
   https://fkhozhrxeofudpfwziyj.supabase.co/auth/v1/callback
   ```
9. Copy the **Client ID** and **Client Secret**

### Step 2: Configure Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/fkhozhrxeofudpfwziyj)
2. Navigate to **Authentication > Providers**
3. Find **Google** in the list
4. Click to enable it
5. Paste your credentials:
   - **Client ID**: (from Step 1)
   - **Client Secret**: (from Step 1)
6. Verify the **Redirect URL** matches what you added to Google:
   ```
   https://fkhozhrxeofudpfwziyj.supabase.co/auth/v1/callback
   ```
7. Click **Save**

### Step 3: Test

1. Clear browser cache/cookies
2. Go to your login page
3. Click "Continue with Google"
4. Should now redirect to Google login instead of showing error

## Code Analysis - OAuth Integration

I've verified that your application code **correctly handles Google OAuth** throughout:

### ✅ Login Implementation (`src/pages/Login.tsx`)

```typescript
const handleGoogleLogin = async () => {
  const redirectPath = isAdminMode ? '/admin' : '/';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
    },
  });
  if (error) throw error;
};
```

**Status:** ✅ Correctly implemented
- Properly redirects admin users to `/admin`
- Regular users go to `/`
- Uses Supabase's standard OAuth flow

### ✅ User Data Handling

**UserMenu Component** (`src/components/UserMenu.tsx`):
```typescript
const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
```

**NewProjectDashboard** (`src/pages/NewProjectDashboard.tsx`):
```typescript
if (user?.user_metadata?.full_name) {
  setUserName(user.user_metadata.full_name);
}
```

**Status:** ✅ Correctly retrieves Google profile data
- Checks `user_metadata.full_name` (Google's standard field)
- Falls back to `user_metadata.name`
- Falls back to email if name not available

### ✅ Database Integration

All database queries properly reference `auth.users` which works seamlessly with OAuth:

1. **User Preferences** - Links to `auth.users(id)`
2. **Organisation Members** - Links to `auth.users(id)`
3. **Projects** - Uses `session.user.id` for ownership
4. **Audit Trails** - Tracks `user_id` from auth

**Status:** ✅ All foreign keys properly reference `auth.users`

### ✅ Row Level Security (RLS)

All RLS policies use `auth.uid()` which works for both:
- Email/password users
- Google OAuth users
- Any OAuth provider

**Status:** ✅ No changes needed - RLS is provider-agnostic

## What Happens When a User Logs in with Google

### First-Time Google Login:

1. User clicks "Continue with Google"
2. Redirected to Google login page
3. User approves permissions (email, profile)
4. Google redirects back to Supabase with auth code
5. Supabase creates user in `auth.users` table automatically:
   ```json
   {
     "id": "uuid-generated-by-supabase",
     "email": "user@gmail.com",
     "user_metadata": {
       "full_name": "John Doe",
       "avatar_url": "https://lh3.googleusercontent.com/...",
       "email": "user@gmail.com",
       "email_verified": true,
       "provider_id": "google-user-id",
       "sub": "google-user-id"
     },
     "app_metadata": {
       "provider": "google",
       "providers": ["google"]
     }
   }
   ```
6. User is redirected to your app with session
7. Your app creates:
   - User preferences record (automatic via foreign key)
   - Organisation membership (if applicable)
   - Any other user-specific data

### Subsequent Logins:

1. User clicks "Continue with Google"
2. Redirected to Google (instant if already logged into Google)
3. Supabase recognizes existing user by email
4. User logged in with existing `user.id`
5. All data tied to that `user.id` remains accessible

## Data Linking - Google Account vs Email/Password

**Important:** A Google account and email/password account with the **same email** are treated as **separate users** in Supabase by default.

For example:
- `john@gmail.com` (Google OAuth) = User A
- `john@gmail.com` (Email/Password) = User B

These are **two different users** with different UUIDs unless you enable account linking.

### To Enable Account Linking (Optional):

1. Go to Supabase Dashboard > **Authentication > Settings**
2. Find **"Confirm email"** setting
3. Enable **"Automatic account linking"**
   - This will merge accounts with the same email
   - User can log in with either Google or password

**Current behavior without linking:**
- Each login method creates a separate account
- User must consistently use the same method
- No data sharing between Google and email/password accounts

## Verification Checklist

After configuration, verify these work:

- [ ] Google login redirects to Google consent screen
- [ ] User can approve permissions
- [ ] User is redirected back to app after login
- [ ] User's name appears in top-right menu
- [ ] User can access their organisation
- [ ] User can create/view projects
- [ ] User preferences save correctly
- [ ] Logout works properly
- [ ] Can log back in with same Google account

## Troubleshooting

### Error: "Access blocked: This app's request is invalid"
- **Fix:** OAuth consent screen not configured properly
- **Action:** Add all required scopes in Google Cloud Console

### Error: "redirect_uri_mismatch"
- **Fix:** Callback URL doesn't match
- **Action:** Ensure `https://fkhozhrxeofudpfwziyj.supabase.co/auth/v1/callback` is added to Google Cloud Console

### Error: "Origin not allowed"
- **Fix:** JavaScript origin not whitelisted
- **Action:** Add your domain to "Authorized JavaScript origins" in Google Cloud Console

### User logs in but no organisation appears
- **Fix:** User not assigned to organisation
- **Action:** Either:
  1. Have an admin invite the user to an organisation
  2. Implement automatic organisation creation on first login
  3. Show organisation creation wizard for new users

### User data doesn't show (name, email, etc.)
- **Check:** Supabase Dashboard > Authentication > Users
- **Verify:** User record has `user_metadata` with `full_name`
- **Fix:** Ensure scopes include `profile` in Google Cloud Console

## Production Considerations

Before going live:

1. **Google Verification:**
   - Submit app for Google verification
   - Required for more than 100 users
   - Takes 1-5 business days

2. **Privacy Policy:**
   - Already implemented at `/privacy` ✅
   - Must be publicly accessible
   - Link it in Google OAuth consent screen

3. **Terms of Service:**
   - Already implemented at `/terms` ✅
   - Must be publicly accessible
   - Link it in Google OAuth consent screen

4. **Brand Assets:**
   - Upload app logo to Google OAuth consent screen
   - Use consistent branding

5. **Security:**
   - Enable 2FA for your Google Cloud account
   - Rotate Client Secret periodically
   - Monitor authentication logs in Supabase

## Support

If issues persist after configuration:

1. Check Supabase logs: **Authentication > Logs**
2. Check Google Cloud Console: **APIs & Services > Credentials**
3. Review [Supabase Google Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
4. Contact Supabase support with your project ref: `fkhozhrxeofudpfwziyj`

---

## Summary

**The Problem:** Google OAuth not configured in Supabase
**The Solution:** Follow Steps 1-2 above to enable it
**Code Status:** ✅ Already correctly implemented
**Time to Fix:** ~10 minutes

No code changes are needed. This is purely a configuration issue that can be resolved in the Supabase and Google Cloud Console dashboards.
