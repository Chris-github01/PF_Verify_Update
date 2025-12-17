# Google OAuth Configuration Guide

## Legal Requirements (Already Completed ✓)

1. **Privacy Policy** - Created at `/src/pages/PrivacyPolicy.tsx`
   - Discloses Google OAuth usage
   - Explains what data is collected (email, name, profile picture)
   - GDPR compliant

2. **Terms of Service** - Created at `/src/pages/TermsOfService.tsx`
   - Users must agree before using the service
   - Covers all legal bases for SaaS operation

## Technical Implementation (Already Completed ✓)

The login page has been updated to:
- ✓ Display Google OAuth button (full width, prominent placement)
- ✓ Remove Microsoft login option
- ✓ Default login redirects to main app
- ✓ Admin login redirects to `/admin` after authentication
- ✓ Admin mode toggle via "Enterprise / Admin login →" link

## Google Cloud Console Setup (Required - Your Action)

You need to configure Google OAuth in Google Cloud Console and Supabase. Follow these steps:

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Name it something like "VerifyTrade Production"

### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
2. Select **External** user type (unless you have Google Workspace)
3. Fill in the required information:
   - **App name:** VerifyTrade
   - **User support email:** Your support email
   - **App logo:** Upload your VerifyTrade logo
   - **Application home page:** Your domain (e.g., https://verifytrade.com)
   - **Authorized domains:** Add your domain
   - **Developer contact:** Your email
4. Add scopes (required):
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
5. Add test users (if in testing mode)
6. Click **Save and Continue**

### Step 3: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name:** VerifyTrade Web Client
   - **Authorized JavaScript origins:**
     - `http://localhost:5173` (for development)
     - `https://yourdomain.com` (your production domain)
   - **Authorized redirect URIs:**
     - `https://[YOUR-SUPABASE-PROJECT-REF].supabase.co/auth/v1/callback`
     - For development: `http://localhost:54321/auth/v1/callback`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** (you'll need these for Supabase)

### Step 4: Configure Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication > Providers**
3. Find **Google** in the provider list
4. Enable Google authentication
5. Paste your Google OAuth credentials:
   - **Client ID:** (from Step 3)
   - **Client Secret:** (from Step 3)
6. Copy the **Callback URL** shown in Supabase
7. Add this callback URL to your Google OAuth settings (if not already added in Step 3)
8. Click **Save**

### Step 5: Test the Integration

1. Clear your browser cache and cookies
2. Navigate to your login page
3. Click "Continue with Google"
4. You should be redirected to Google's login page
5. After successful authentication, you should be redirected back to your app

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
- The redirect URI in Supabase doesn't match what's configured in Google Cloud Console
- Ensure the callback URL in Supabase exactly matches what's in Google Cloud Console
- Note: There should be NO trailing slash

### "Access blocked: This app's request is invalid"
- Your OAuth consent screen is not properly configured
- Make sure you've added all required scopes
- Verify your authorized domains are correct

### "This app isn't verified"
- This is normal for apps in testing mode
- Click "Advanced" → "Go to VerifyTrade (unsafe)" to proceed
- For production, you must submit your app for Google verification

### Users can't log in
- Check Supabase logs: **Authentication > Logs**
- Verify the Google provider is enabled in Supabase
- Ensure your Client ID and Client Secret are correct

## Google Verification (Production Requirement)

For production use, you must verify your app with Google:

1. Complete the OAuth consent screen fully
2. Add your Privacy Policy URL (already created)
3. Add your Terms of Service URL (already created)
4. Submit for verification in Google Cloud Console
5. Wait 1-5 business days for review
6. Google may request additional documentation

**Required Documentation:**
- Privacy Policy (✓ Already created)
- Terms of Service (✓ Already created)
- Explanation of how you use Google user data
- YouTube video showing the OAuth flow (optional but helpful)

## Security Best Practices

1. **Never commit credentials** to Git
   - Client Secret should only be in Supabase dashboard
   - Use environment variables for any keys

2. **Use HTTPS in production**
   - Google OAuth requires HTTPS for authorized origins
   - Supabase automatically provides HTTPS

3. **Limit OAuth scopes**
   - Only request `email`, `profile`, and `openid`
   - Never request more access than necessary

4. **Monitor failed login attempts**
   - Check Supabase authentication logs regularly
   - Set up alerts for unusual activity

5. **Keep credentials secure**
   - Rotate Client Secret if compromised
   - Use different OAuth credentials for dev/staging/production

## Data Handling Compliance

As per your Privacy Policy (already implemented):

1. **Data Collection:** You collect:
   - Email address
   - Full name
   - Profile picture URL
   - Google user ID

2. **Data Usage:** You use this data to:
   - Authenticate users
   - Create user accounts
   - Personalize the user experience

3. **Data Storage:**
   - Stored in Supabase (already encrypted)
   - Follows GDPR requirements
   - Users can request deletion

4. **Third-Party Sharing:**
   - Data is NOT shared with third parties
   - AI processing uses aggregated data only

## Support

If you encounter issues:

1. Check [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/social-login/auth-google)
2. Review [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
3. Contact Supabase support if authentication fails
4. Contact Google support if OAuth consent screen has issues

## Completion Checklist

- [ ] Create Google Cloud Project
- [ ] Configure OAuth consent screen
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized JavaScript origins
- [ ] Add authorized redirect URIs
- [ ] Enable Google provider in Supabase
- [ ] Add Client ID and Client Secret to Supabase
- [ ] Test login flow
- [ ] Test admin login flow
- [ ] Submit for Google verification (production)
- [ ] Update authorized domains (production)

---

**Note:** The code implementation is complete. You only need to configure Google Cloud Console and Supabase as described above. No further code changes are required for Google OAuth to work.
