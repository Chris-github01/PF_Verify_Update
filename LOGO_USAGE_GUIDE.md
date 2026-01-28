# VerifyTrade Logo Usage Guide

This guide provides information about all available VerifyTrade logo variations and their recommended use cases.

---

## Logo Variations

### 1. **Horizontal Logo - White** (Primary for Dark Backgrounds)
**File:** `verifytrade-logo-white.svg`
**Size:** 320x80px
**Use Case:** Primary logo for navigation bars, headers on dark backgrounds
**Current Usage:** Landing page header

**Features:**
- White shield with checkmark
- White "VerifyTrade" text
- Optimized for dark backgrounds (#0f172a, navy, black)
- Clean, professional appearance

---

### 2. **Horizontal Logo - Color** (Primary for Light Backgrounds)
**File:** `verifytrade-logo-horizontal.svg`
**Size:** 320x80px
**Use Case:** Documents, presentations, light-themed pages

**Features:**
- Gradient blue shield (light to dark blue)
- "Verify" in dark blue, "Trade" in light blue
- Best on white or light gray backgrounds
- Full brand color representation

---

### 3. **Icon Only** (App Icons & Favicons)
**File:** `verifytrade-icon-only.svg`
**Size:** 80x80px
**Use Case:** Favicons, app icons, social media profiles, small spaces

**Features:**
- Square format (1:1 ratio)
- Shield with checkmark only
- Gradient blue coloring
- Scales perfectly to any size

---

### 4. **Simple Logo** (Large Format)
**File:** `verifytrade-logo-simple.svg`
**Size:** 200x200px
**Use Case:** Hero sections, promotional materials, large displays

**Features:**
- Larger, more detailed shield
- Prominent checkmark
- No text - icon only
- Perfect for billboards, posters, banners

---

### 5. **Monochrome Logo** (Print & Single Color)
**File:** `verifytrade-logo-monochrome.svg`
**Size:** 320x80px
**Use Case:** Print materials, faxes, single-color applications

**Features:**
- Black shield with white checkmark
- Black text
- Printer-friendly
- Maintains clarity in black & white

---

## Technical Specifications

### File Format
- **Vector Format:** SVG (Scalable Vector Graphics)
- **Advantages:**
  - Infinite scalability without quality loss
  - Small file sizes (741 bytes - 3KB)
  - Works at any resolution
  - Transparent backgrounds (where applicable)

### Color Palette

**Primary Colors:**
- Light Blue: `#2E86AB` (rgb 46, 134, 171)
- Dark Blue: `#1B4F72` (rgb 27, 79, 114)
- White: `#FFFFFF` for dark backgrounds
- Black: `#000000` for monochrome

**Gradient:**
- Vertical gradient from Light Blue (#2E86AB) to Dark Blue (#1B4F72)

---

## Usage Guidelines

### Minimum Sizes
- **Horizontal logos:** Minimum 150px width for readability
- **Icon only:** Minimum 24px for web, 48px for print
- **Large format:** No minimum, designed for scaling up

### Clear Space
Maintain clear space around the logo equal to the height of the shield on all sides.

### Don'ts
- Don't distort or stretch the logo
- Don't change colors (except using provided variations)
- Don't add effects like drop shadows or glows
- Don't place on busy backgrounds without sufficient contrast
- Don't rotate or skew the logo

---

## Implementation Examples

### HTML/React
```jsx
{/* Navigation bar on dark background */}
<img
  src="/verifytrade-logo-white.svg"
  alt="VerifyTrade"
  className="h-12 w-auto"
/>

{/* Favicon */}
<link rel="icon" href="/verifytrade-icon-only.svg" type="image/svg+xml" />

{/* Light background */}
<img
  src="/verifytrade-logo-horizontal.svg"
  alt="VerifyTrade"
  className="h-12 w-auto"
/>
```

### CSS Background
```css
.logo {
  background-image: url('/verifytrade-logo-white.svg');
  background-size: contain;
  background-repeat: no-repeat;
  width: 200px;
  height: 50px;
}
```

---

## File Locations

**Development:**
- `/public/verifytrade-logo-white.svg`
- `/public/verifytrade-logo-horizontal.svg`
- `/public/verifytrade-icon-only.svg`
- `/public/verifytrade-logo-simple.svg`
- `/public/verifytrade-logo-monochrome.svg`

**Production (after build):**
- `/dist/verifytrade-logo-white.svg`
- (etc.)

---

## Accessibility

All logos include:
- Descriptive `alt` text
- Semantic markup
- High contrast ratios (4.5:1 minimum)
- Clear, readable text at all sizes

**Recommended Alt Text:**
- `"VerifyTrade - Trust & Verification"`
- `"VerifyTrade Logo"`
- `"VerifyTrade Shield"`

---

## Version History

**v2.0** (Current)
- Created simplified shield-and-checkmark design
- Generated 5 optimized SVG variations
- Implemented responsive sizing
- Added comprehensive usage guide

**v1.0** (Legacy)
- Multi-quadrant shield with four trade symbols
- Complex gradient system
- Larger file size (4.3KB)

---

## Support

For logo modifications or additional variations, please contact the design team or modify the SVG files directly using vector editing software (Adobe Illustrator, Figma, Inkscape).

**Design Principles:**
- Simplicity - Clean, minimal design
- Trust - Shield conveys security and protection
- Verification - Checkmark represents approval and accuracy
- Professional - Suitable for B2B enterprise applications
