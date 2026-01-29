# Logo Troubleshooting Guide

## Quick Reference
**Current Logo Location**: `/verifytrade-logo-white.svg`
**Used In**: Landing Page Navigation (LandingPage.tsx:33)
**Last Updated**: January 2026

---

## 1. Initial Assessment

### 1.1 Check Logo Visibility Across Pages

**Action**: Test logo display on different pages
```bash
# Navigate through your application and check these locations:
- Landing Page (/)
- Dashboard pages
- Admin sections
- Any other public-facing pages
```

**What to Look For**:
- Does the logo appear on some pages but not others?
- Is the logo completely missing or showing a broken image icon?
- Are there console errors when the page loads?

### 1.2 Cross-Browser Testing

**Test on Multiple Browsers**:
```
✓ Chrome/Edge (Chromium-based)
✓ Firefox
✓ Safari (if on macOS)
✓ Mobile browsers (iOS Safari, Chrome Mobile)
```

**Quick Test Command** (using browser DevTools):
```javascript
// Paste in browser console to check if logo exists
fetch('/verifytrade-logo-white.svg')
  .then(r => console.log('Logo Status:', r.status, r.ok ? '✓ Available' : '✗ Not Found'))
  .catch(e => console.error('Logo Error:', e));
```

### 1.3 Recent Changes Checklist

Ask yourself:
- [ ] Was the logo recently renamed or moved?
- [ ] Were any build configurations changed (Vite, package.json)?
- [ ] Was there a recent deployment?
- [ ] Were any public folder changes made?
- [ ] Did you update dependencies?

---

## 2. Technical Diagnostics

### 2.1 Inspect HTML Element

**Using Browser DevTools** (F12 or Right-Click → Inspect):

1. **Locate the Logo Element**:
   ```
   - Open DevTools (F12)
   - Click the "Select Element" tool (top-left corner icon)
   - Click on where the logo should be
   ```

2. **Check the HTML Structure**:
   ```html
   <!-- Expected structure in LandingPage.tsx -->
   <img
     src="/verifytrade-logo-white.svg"
     alt="VerifyTrade - Trust & Verification"
     class="h-12 w-auto object-contain"
   />
   ```

3. **Common Issues to Identify**:
   - Is the `src` attribute correct?
   - Is the element hidden with `display: none`?
   - Are there any inline styles overriding visibility?
   - Check for `opacity: 0` or `visibility: hidden`

### 2.2 Verify File Path

**Check Current Implementation**:
```bash
# From project root, verify the file exists
ls -la public/verifytrade-logo-white.svg

# Expected output:
# -rw-r--r-- 1 user user 1000 Jan 29 01:25 public/verifytrade-logo-white.svg
```

**Verify in Source Code**:
```bash
# Search for logo references in the codebase
grep -r "verifytrade-logo-white" src/
```

**Path Troubleshooting**:
```javascript
// Vite serves files from /public as root-level URLs
// ✓ CORRECT:   /verifytrade-logo-white.svg
// ✗ WRONG:     ./verifytrade-logo-white.svg
// ✗ WRONG:     /public/verifytrade-logo-white.svg
// ✗ WRONG:     verifytrade-logo-white.svg (missing leading slash)
```

### 2.3 Network Tab Analysis

**Steps**:
1. Open DevTools → Network Tab
2. Refresh the page (Ctrl+R or Cmd+R)
3. Filter by "Img" or search for "verifytrade"

**Status Code Reference**:
| Status Code | Meaning | Action |
|------------|---------|--------|
| 200 | Success | Logo loaded correctly |
| 304 | Not Modified | Cached version (normal) |
| 404 | Not Found | File path is wrong or file missing |
| 403 | Forbidden | Permission issue |
| 500 | Server Error | Backend configuration issue |

**If Status is 404**:
```bash
# Verify file exists in public directory
ls -la public/ | grep verifytrade

# If missing, check if it was accidentally deleted
git log --all --full-history -- "public/verifytrade-logo-white.svg"
```

### 2.4 CSS Styling Investigation

**Check for Hidden Styles**:
```javascript
// Paste in browser console
const logo = document.querySelector('img[alt*="VerifyTrade"]');
if (logo) {
  const styles = window.getComputedStyle(logo);
  console.log({
    display: styles.display,      // Should NOT be 'none'
    visibility: styles.visibility, // Should be 'visible'
    opacity: styles.opacity,       // Should be '1'
    width: styles.width,           // Should NOT be '0px'
    height: styles.height          // Should NOT be '0px'
  });
} else {
  console.error('Logo element not found in DOM');
}
```

**Common CSS Issues**:
```css
/* Issue 1: Hidden by display */
img { display: none; }  /* ✗ Makes logo invisible */

/* Issue 2: Zero dimensions */
img { width: 0; height: 0; }  /* ✗ Logo has no size */

/* Issue 3: Positioned off-screen */
img { position: absolute; left: -9999px; }  /* ✗ Hidden off screen */

/* Issue 4: Parent container hidden */
nav { visibility: hidden; }  /* ✗ Hides entire nav including logo */
```

### 2.5 Console Error Inspection

**Open Console** (F12 → Console tab)

**Common Error Messages**:

```javascript
// Error 1: File not found
"GET http://localhost:5173/verifytrade-logo-white.svg 404 (Not Found)"
// Solution: Check file path and ensure file exists

// Error 2: CORS error
"Access to image at '...' from origin '...' has been blocked by CORS policy"
// Solution: Ensure file is in /public folder, not external

// Error 3: Invalid SVG
"Image corrupt or truncated"
// Solution: Validate SVG file format

// Error 4: Loading error
"Logo failed to load"
// Solution: This is from our onError handler - check file permissions
```

---

## 3. Common Solutions

### 3.1 File Path Corrections

**Problem**: Logo file path is incorrect

**Location**: `src/pages/LandingPage.tsx:33`

**Current Code**:
```typescript
<img
  src="/verifytrade-logo-white.svg"
  alt="VerifyTrade - Trust & Verification"
  className="h-12 w-auto object-contain"
/>
```

**Troubleshooting Steps**:

1. **Verify File Location**:
   ```bash
   # Check if file exists (from project root)
   test -f public/verifytrade-logo-white.svg && echo "✓ File exists" || echo "✗ File missing"
   ```

2. **If File is Missing**, choose an available logo:
   ```bash
   # List available logos
   ls -1 public/verifytrade*.svg

   # Available options:
   # - verifytrade-logo-white.svg (current)
   # - verifytrade-logo-horizontal.svg
   # - verifytrade-logo-simple.svg
   # - verifytrade-icon-only.svg
   # - verifytrade-shield.svg
   # - verifytrade-logo-monochrome.svg
   ```

3. **Update the Path** (if needed):
   ```typescript
   // Example: Switch to horizontal logo
   <img
     src="/verifytrade-logo-horizontal.svg"
     alt="VerifyTrade - Trust & Verification"
     className="h-12 w-auto object-contain"
   />
   ```

### 3.2 Image File Replacement

**Problem**: Logo file is corrupted or outdated

**Solution**:

1. **Backup Current File**:
   ```bash
   cp public/verifytrade-logo-white.svg public/verifytrade-logo-white.svg.backup
   ```

2. **Validate SVG File**:
   ```bash
   # Check if file is valid XML/SVG
   xmllint --noout public/verifytrade-logo-white.svg 2>&1

   # If xmllint not available, check file content
   head -1 public/verifytrade-logo-white.svg
   # Should start with: <?xml version="1.0" or <svg
   ```

3. **Replace with Known Good File**:
   ```bash
   # Option 1: Use another logo variant
   cp public/verifytrade-logo-horizontal.svg public/verifytrade-logo-white.svg

   # Option 2: Restore from git
   git checkout HEAD -- public/verifytrade-logo-white.svg
   ```

4. **Verify File Permissions**:
   ```bash
   # Ensure file is readable
   chmod 644 public/verifytrade-logo-white.svg
   ```

### 3.3 Cache Clearing Methods

**Problem**: Browser or CDN serving old/broken version

#### Browser Cache (Client-Side)

**Method 1: Hard Refresh**
```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

**Method 2: Clear Specific File from Cache**
```javascript
// Paste in browser console
// This forces a fresh load by adding a cache-busting parameter
const img = document.querySelector('img[alt*="VerifyTrade"]');
if (img) {
  img.src = img.src.split('?')[0] + '?cb=' + Date.now();
}
```

**Method 3: Clear All Browser Cache**
```
Chrome: Settings → Privacy and Security → Clear Browsing Data
Firefox: Settings → Privacy & Security → Cookies and Site Data → Clear Data
Safari: Preferences → Privacy → Manage Website Data → Remove All
```

#### Development Server Cache

**Vite Dev Server**:
```bash
# Stop the dev server (Ctrl+C)
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

#### Production Build Cache

```bash
# Clear build artifacts
rm -rf dist/

# Rebuild
npm run build

# Verify logo in build output
ls -la dist/verifytrade-logo-white.svg
```

### 3.4 CSS Troubleshooting Techniques

**Problem**: Logo is loaded but hidden by CSS

**Quick Diagnostic**:
```javascript
// Run in browser console
const logo = document.querySelector('img[alt*="VerifyTrade"]');
if (logo) {
  // Force logo to be visible
  logo.style.display = 'block !important';
  logo.style.visibility = 'visible !important';
  logo.style.opacity = '1 !important';
  logo.style.width = 'auto !important';
  logo.style.height = '48px !important';
  console.log('✓ Logo should now be visible');
} else {
  console.error('✗ Logo element not found');
}
```

**Common Fixes**:

1. **Remove Conflicting Styles**:
   ```typescript
   // Current styling (LandingPage.tsx:35)
   className="h-12 w-auto object-contain"

   // If this doesn't work, try inline styles:
   style={{ height: '48px', width: 'auto', display: 'block' }}
   ```

2. **Check Tailwind Configuration**:
   ```javascript
   // Verify Tailwind classes are working
   // In browser console:
   document.querySelector('img[alt*="VerifyTrade"]').classList
   // Should show: ['h-12', 'w-auto', 'object-contain']
   ```

3. **Override Parent Container Styles**:
   ```typescript
   // Wrap logo in a guaranteed-visible container
   <div className="flex items-center" style={{ minHeight: '48px' }}>
     <img
       src="/verifytrade-logo-white.svg"
       alt="VerifyTrade - Trust & Verification"
       className="h-12 w-auto object-contain"
     />
   </div>
   ```

### 3.5 Error Handler Review

**Current Implementation** (LandingPage.tsx:36-39):
```typescript
onError={(e) => {
  e.currentTarget.style.display = 'none';
  console.error('Logo failed to load');
}}
```

**Problem**: This hides the logo on ANY error, making debugging harder.

**Improved Version**:
```typescript
onError={(e) => {
  console.error('Logo failed to load:', {
    src: e.currentTarget.src,
    naturalWidth: e.currentTarget.naturalWidth,
    complete: e.currentTarget.complete,
    currentSrc: e.currentTarget.currentSrc
  });

  // Fallback: Try alternative logo
  if (e.currentTarget.src.includes('verifytrade-logo-white.svg')) {
    e.currentTarget.src = '/verifytrade-logo-horizontal.svg';
  } else {
    // Hide only if all attempts failed
    e.currentTarget.style.display = 'none';
  }
}}
```

---

## 4. Prevention Measures

### 4.1 Best Practices for Logo Implementation

**✓ DO**:
```typescript
// 1. Use meaningful alt text
<img src="/logo.svg" alt="Company Name - Descriptive Tagline" />

// 2. Specify dimensions for better layout stability
<img
  src="/logo.svg"
  alt="Company Logo"
  width="120"
  height="48"
  className="object-contain"
/>

// 3. Implement graceful fallbacks
<img
  src="/logo.svg"
  alt="Company Logo"
  onError={(e) => {
    // Try alternative formats
    e.currentTarget.src = '/logo.png';
  }}
/>

// 4. Use environment-aware paths
const logoPath = import.meta.env.DEV
  ? '/verifytrade-logo-white.svg'
  : '/verifytrade-logo-white.svg';

// 5. Preload critical images
<link rel="preload" as="image" href="/verifytrade-logo-white.svg" />
```

**✗ DON'T**:
```typescript
// 1. Don't use relative paths from /public
<img src="./logo.svg" />  // ✗ Won't work

// 2. Don't reference /public in path
<img src="/public/logo.svg" />  // ✗ Wrong

// 3. Don't use dynamic imports for logos
const logo = await import('/logo.svg');  // ✗ Unnecessary complexity

// 4. Don't rely on external CDN for critical branding
<img src="https://cdn.example.com/logo.svg" />  // ✗ Single point of failure

// 5. Don't use overly large files
<img src="/logo-4k-ultra-hd.png" />  // ✗ Impacts performance
```

### 4.2 Recommended File Formats and Sizes

**File Format Guidelines**:

| Format | Use Case | Pros | Cons | Recommended? |
|--------|----------|------|------|-------------|
| SVG | Primary logo | Scalable, small file size, crisp at any size | Limited browser support for complex effects | ✓ **Yes** (Primary) |
| PNG | Fallback, complex logos | Wide support, transparency | Fixed resolution, larger files | ✓ Yes (Fallback) |
| WebP | Modern alternative | Best compression, quality | Limited old browser support | Maybe |
| JPEG | Photos | Good compression | No transparency, not for logos | ✗ No |

**Size Recommendations**:

```
Primary Logo (SVG):
- Max file size: 50 KB (ideally < 10 KB)
- Optimized, minified SVG

Fallback Logo (PNG):
- 2x resolution: 240px height (for h-12 = 48px × 2)
- Max file size: 50 KB
- Use compression tools (TinyPNG, etc.)

Icon Only:
- 64×64px minimum
- 128×128px recommended for Retina
```

**Optimization Tools**:
```bash
# SVG Optimization (SVGO)
npm install -g svgo
svgo public/verifytrade-logo-white.svg

# PNG Compression
# Use online tools: tinypng.com, squoosh.app
```

### 4.3 Backup and Version Control

**Git Best Practices**:

```bash
# 1. Always commit logos to version control
git add public/verifytrade*.svg
git commit -m "Add company logo assets"

# 2. Track changes to logo files
git log --follow -- public/verifytrade-logo-white.svg

# 3. Create a logos backup branch
git checkout -b logos-archive
git checkout main

# 4. Use git LFS for large image assets (optional)
# Only if you have many large images
git lfs track "*.png"
git lfs track "*.jpg"
```

**File Organization**:

```
project/
├── public/
│   ├── logos/                    # ✓ Organized approach
│   │   ├── verifytrade-logo-white.svg
│   │   ├── verifytrade-logo-dark.svg
│   │   ├── verifytrade-icon.svg
│   │   └── README.md            # Document each logo variant
│   │
│   └── verifytrade-*.svg        # ✓ Current flat structure (also fine)
│
└── docs/
    └── branding/
        ├── logo-usage-guide.md
        └── brand-assets.md
```

**Documentation Template** (Create `/public/logos/README.md`):

```markdown
# Logo Assets

## Available Variants

### Primary Logos
- `verifytrade-logo-white.svg` - White version for dark backgrounds
- `verifytrade-logo-horizontal.svg` - Full horizontal lockup
- `verifytrade-logo-simple.svg` - Simplified version

### Icons
- `verifytrade-icon-only.svg` - Icon without text
- `verifytrade-shield.svg` - Shield icon

### Specialty
- `verifytrade-logo-monochrome.svg` - Single color version

## Usage Guidelines

- **Navigation**: Use `verifytrade-logo-white.svg`
- **Light backgrounds**: Use dark logo variant
- **Favicons**: Use `verifytrade-icon-only.svg`
- **Print**: Use `verifytrade-logo-monochrome.svg`

## Maintenance Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-29 | Initial logo set | Team |
```

### 4.4 Automated Testing

**Add Logo Availability Test**:

```typescript
// tests/logo-availability.test.ts
describe('Logo Assets', () => {
  test('primary logo file exists', async () => {
    const response = await fetch('/verifytrade-logo-white.svg');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg');
  });

  test('logo loads in component', () => {
    const { getByAltText } = render(<LandingPage />);
    const logo = getByAltText(/VerifyTrade/i);
    expect(logo).toHaveAttribute('src', '/verifytrade-logo-white.svg');
  });
});
```

**Pre-commit Hook** (`.husky/pre-commit`):

```bash
#!/bin/sh
# Verify critical assets exist before commit

REQUIRED_LOGOS=(
  "public/verifytrade-logo-white.svg"
  "public/verifytrade-icon-only.svg"
)

for logo in "${REQUIRED_LOGOS[@]}"; do
  if [ ! -f "$logo" ]; then
    echo "❌ Error: Required logo missing: $logo"
    exit 1
  fi
done

echo "✅ All required logos present"
```

---

## 5. Quick Reference Checklist

### When Logo Doesn't Display:

```
□ Check browser console for errors (F12 → Console)
□ Verify file exists: ls -la public/verifytrade-logo-white.svg
□ Check Network tab (F12 → Network) - look for 404/403 errors
□ Try hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
□ Inspect element (Right-click → Inspect) - check if hidden by CSS
□ Clear browser cache completely
□ Restart development server
□ Verify file path doesn't include /public/ prefix
□ Check file permissions: chmod 644 public/verifytrade-logo-white.svg
□ Try alternative logo: verifytrade-logo-horizontal.svg
□ Run: git status (check if file was accidentally deleted)
```

### Component Reference:

**Location**: `src/pages/LandingPage.tsx:32-40`

```typescript
<img
  src="/verifytrade-logo-white.svg"
  alt="VerifyTrade - Trust & Verification"
  className="h-12 w-auto object-contain"
  onError={(e) => {
    e.currentTarget.style.display = 'none';
    console.error('Logo failed to load');
  }}
/>
```

### Available Logo Files:

```
✓ verifytrade-logo-white.svg (1.0 KB) - Current primary
✓ verifytrade-logo-horizontal.svg (1.3 KB)
✓ verifytrade-logo-simple.svg (1.1 KB)
✓ verifytrade-icon-only.svg (1.1 KB)
✓ verifytrade-shield.svg (3.0 KB)
✓ verifytrade-logo-monochrome.svg (0.7 KB)
✓ verifytrade_logo_2.jpg (318.7 KB) - Not recommended for web
```

---

## 6. Getting Help

If you've tried all the above steps and the logo still doesn't display:

1. **Collect Diagnostic Information**:
   ```bash
   # Run this and save output
   echo "=== Logo Diagnostics ==="
   echo "File exists: $(test -f public/verifytrade-logo-white.svg && echo YES || echo NO)"
   echo "File size: $(ls -lh public/verifytrade-logo-white.svg 2>/dev/null | awk '{print $5}')"
   echo "File permissions: $(ls -l public/verifytrade-logo-white.svg 2>/dev/null | awk '{print $1}')"
   echo "Recent changes:"
   git log -1 --oneline -- public/verifytrade-logo-white.svg
   ```

2. **Check Browser Console** (F12):
   - Copy all errors related to "verifytrade" or "logo"
   - Take a screenshot of the Network tab

3. **Document Your Environment**:
   ```
   - Browser: Chrome/Firefox/Safari (version)
   - OS: Windows/Mac/Linux
   - Node version: node --version
   - npm version: npm --version
   - Dev or Production: npm run dev / npm run build
   ```

4. **Contact Support** with:
   - Diagnostic information above
   - Console errors
   - What you've already tried
   - When the issue started

---

## Appendix: Project-Specific Information

### Current Implementation Details

**Logo in Use**: `/verifytrade-logo-white.svg`
- **Size**: 1.0 KB
- **Dimensions**: Scalable (SVG)
- **Color**: White (for dark navigation background)
- **Location**: `public/verifytrade-logo-white.svg`
- **Used in**: Landing Page navigation bar

**Navigation Background**: Dark slate (`bg-slate-900/95`)
- This is why white logo is used
- If changing to light background, switch to a darker logo variant

### Related Files

```
src/pages/LandingPage.tsx - Primary usage (line 33)
public/verifytrade-logo-white.svg - Logo file
tailwind.config.js - Styling configuration
vite.config.ts - Build configuration
```

### Environment Configuration

**Vite Configuration** (`vite.config.ts`):
- Static assets in `/public` are served at root level
- No special configuration needed for SVG files
- Automatic copying to `dist/` on build

---

**Last Updated**: January 29, 2026
**Maintainer**: Development Team
**Version**: 1.0
