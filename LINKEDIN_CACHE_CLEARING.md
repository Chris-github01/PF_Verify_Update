# LinkedIn Cache Clearing Instructions

## Why You're Still Seeing Old Branding

LinkedIn caches link previews for up to **7 days**. Even though the website has been updated with VerifyTrade branding, LinkedIn is showing the cached version from when it was first scraped.

## How to Force LinkedIn to Refresh

### Option 1: LinkedIn Post Inspector (Recommended)

1. Go to: https://www.linkedin.com/post-inspector/
2. Enter your URL: `https://www.verifytrade.co.nz/`
3. Click "Inspect"
4. LinkedIn will fetch the latest version and show you the new preview
5. The cache will be cleared and future shares will show the updated branding

### Option 2: Add URL Parameter (Quick Test)

When sharing, add a random parameter to force a refresh:
- `https://www.verifytrade.co.nz/?v=2`
- `https://www.verifytrade.co.nz/?refresh=1`

This tricks LinkedIn into thinking it's a new URL and fetching fresh metadata.

### Option 3: Wait It Out

If you don't need immediate results, LinkedIn's cache will naturally expire within 7 days, and the new branding will appear automatically.

## What Was Changed

✅ **HTML Meta Tags** - All updated in `index.html`:
- Title: "VerifyTrade | Passive Fire Quote Auditing Platform"
- OG tags with VerifyTrade branding
- Twitter Card tags
- All Bolt references removed

✅ **React Components** - All branding updated:
- LandingPage.tsx
- Login.tsx
- Navigation.tsx
- Sidebar.tsx
- AppFooter.tsx
- SplashScreen.tsx
- Pricing.tsx
- All other user-facing components

✅ **Build Output** - Verified clean
- No PassiveFire references in compiled code
- No Bolt references anywhere
- All meta tags correctly set

## Testing Other Platforms

### Facebook
https://developers.facebook.com/tools/debug/
- Enter URL and click "Scrape Again"

### Twitter
https://cards-dev.twitter.com/validator
- Enter URL to validate Twitter Cards

### WhatsApp
- Simply share the link in a chat
- Delete and reshare if showing old preview

### Slack
- Share the URL in any channel
- Slack usually updates quickly (1-2 hours)

## Verification

After using LinkedIn Post Inspector, you should see:
- **Title**: VerifyTrade | Passive Fire Quote Auditing Platform
- **Description**: Upload passive fire quotes and receive a full audit exposing scope gaps, missing systems, and procurement risk — before award.
- **Image**: Your og-image.png (1200×630px)
- **No references to**: PassiveFire, bolt.new, or any old branding

## Common Issues

**Q: Post Inspector shows updated title but old image**
A: The og-image.png might be cached by CDN. Try:
1. Clear CDN cache if using one
2. Rename image to og-image-v2.png and update HTML
3. Wait 24 hours for CDN propagation

**Q: Still seeing PassiveFire after inspection**
A: Check that you've deployed the latest build:
1. Verify `npm run build` completed successfully
2. Confirm dist/ folder deployed to production
3. Check actual deployed site shows VerifyTrade in browser

**Q: Different platforms showing different previews**
A: Each platform has its own cache:
- Use each platform's validator tool separately
- Some platforms update faster than others
- Allow up to 24 hours for all to sync

## Next Steps

1. Deploy this build to production
2. Use LinkedIn Post Inspector to force refresh
3. Test sharing on LinkedIn - should show VerifyTrade
4. Repeat for other platforms as needed
5. Future shares will automatically show correct branding
