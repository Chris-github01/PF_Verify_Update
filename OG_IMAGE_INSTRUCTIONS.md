# Open Graph Image Instructions

## Current Status

A basic placeholder OG image has been created at `public/og-image.png`. However, for optimal social media previews, you should create a professional branded image.

## Required Specifications

- **Dimensions**: 1200×630 pixels (2:1 aspect ratio)
- **Format**: PNG (required for best compatibility)
- **File location**: `public/og-image.png`
- **URL**: https://www.verifytrade.co.nz/og-image.png

## Design Guidelines

### Brand Elements
- **Primary Brand**: VerifyTrade
- **Secondary Brand**: Verify+ Passive Fire
- **Tagline**: "Passive Fire Quote Auditing Platform"

### Visual Style
- **Background**: Dark gradient (#0f172a to #1e293b)
- **Primary Color**: Blue (#3b82f6)
- **Text Colors**: Light blues and grays (#cbd5e1, #94a3b8, #60a5fa)
- **Style**: Minimal, professional, modern

### Key Message
"Upload passive fire quotes and receive a full audit exposing scope gaps, missing systems, and procurement risk — before award."

## How to Create Professional Version

### Option 1: Use the HTML Template (Recommended)

1. Open `create-og-image.html` in your browser
2. Use browser dev tools to set viewport to exactly 1200×630px
3. Take a screenshot (Cmd+Shift+4 on Mac, or browser screenshot tool)
4. Save as `public/og-image.png`

### Option 2: Use Figma/Canva

1. Create a new design at 1200×630px
2. Use the design guidelines above
3. Export as PNG
4. Save to `public/og-image.png`

### Option 3: Use Online Tool

1. Visit https://www.canva.com/create/open-graph-images/
2. Select 1200×630px template
3. Apply dark background and VerifyTrade branding
4. Export and save to `public/og-image.png`

### Option 4: Professional Design

Hire a designer to create a custom OG image following the specifications above.

## Testing Link Previews

After creating and deploying the new image, test it on:

### LinkedIn Post Inspector
https://www.linkedin.com/post-inspector/

### Facebook Sharing Debugger
https://developers.facebook.com/tools/debug/

### Twitter Card Validator
https://cards-dev.twitter.com/validator

### WhatsApp/Slack
Share the URL directly and check the preview

## Deployment

After updating `public/og-image.png`:

1. Rebuild the project: `npm run build`
2. Deploy to production
3. Clear any CDN caches if applicable
4. Test with the validators above

## Notes

- Some platforms cache OG images for up to 7 days
- Use validators to force a refresh
- The image should be under 8MB for best compatibility
- Avoid text smaller than 24px for readability
- High contrast is essential for visibility
