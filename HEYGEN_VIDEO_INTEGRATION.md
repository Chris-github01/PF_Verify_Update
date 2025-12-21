# Vimeo Video Integration - Hero Section

Embedded Vimeo video in landing page hero section without uploading MP4 file (avoiding 5MB limit).

## Implementation Summary

### Component Created: `HeroVideo.tsx`

**Location:** `src/components/HeroVideo.tsx`

**Features:**
- Cinematic SaaS card design with premium styling
- Responsive 16:9 video container
- Vimeo iframe embed with proper permissions
- Graceful fallback for blocked iframes
- CTA buttons (Book Demo + Email)
- Trust line for credibility
- Lazy loading for performance
- Accessibility features (aria-label, title)

### Styling Details

**Card Design:**
- Max-width: 1100px (centered)
- Border-radius: 16px (rounded-2xl)
- Border: 1px solid slate-700/50 (subtle)
- Shadow: shadow-2xl (large soft shadow)
- Background: Gradient slate-900/90 to slate-800/90 with backdrop blur
- Glow: Subtle radial gradient behind card (orange/red 10% opacity, blur-3xl)

**Video Container:**
- Responsive 16:9 aspect ratio (padding-top: 56.25%)
- Black background for letterboxing
- Iframe with proper permissions: autoplay, fullscreen, picture-in-picture
- No autoplay by default

**Fallback Design:**
- Poster placeholder with gradient background
- Large play button (orange-500 with hover effects)
- Shield icon and placeholder text
- Clicking opens Vimeo link in new tab
- Smooth hover transitions

**Accessibility & Performance:**
- `loading="lazy"` - Lazy loads iframe for faster initial page load
- `title="Verify+ Overview Video"` - Screen reader support
- `aria-label="Verify+ Overview Video"` - Enhanced accessibility
- `frameBorder="0"` - Clean iframe styling
- Rounded corners on video container

**CTA Buttons:**
- Primary: "Book a Demo" (orange gradient, shadow effects)
- Secondary: "Email Us" (slate-700, border, mailto link)
- Full width on mobile, side-by-side on desktop
- Hover scale and shadow effects

**Trust Line:**
- Small text below buttons
- Slate-500 color
- Message: "Built for contractors, QS teams, engineers, and delivery managers across NZ & Australia."

### Landing Page Integration

**File:** `src/pages/LandingPage.tsx`

**Placement:**
1. After headline (line 88-93)
2. After subheadline (line 95-97)
3. After description (line 100-102)
4. **→ VIDEO COMPONENT INSERTED HERE** (line 106)
5. Before value prop box (line 109-113)
6. Before CTA buttons (line 115-127)

**Flow:**
```
Headline
  ↓
Subheadline
  ↓
Description
  ↓
🎥 HeroVideo Component
  ↓
Value Prop Box
  ↓
CTA Buttons
```

### Mobile Responsiveness

**Breakpoints:**
- Mobile (< 640px): Full-width video with padding, single-column CTAs
- Tablet (640px - 1024px): Centered video, side-by-side CTAs
- Desktop (> 1024px): Max-width 1100px, full cinematic layout

**Mobile Layout:**
- Video appears immediately after headline/subheadline
- Maintains 16:9 aspect ratio
- CTAs stack vertically
- All padding and font sizes scale appropriately
- Touch-friendly button sizes (py-3.5)

### Vimeo Video Details

**Embed URL:** `https://player.vimeo.com/video/1148392322?h=fl`
**Direct URL:** `https://vimeo.com/1148392322`

**Iframe Attributes:**
- `src="https://player.vimeo.com/video/1148392322?h=fl"`
- `allow="autoplay; fullscreen; picture-in-picture"`
- `allowFullScreen` - Enables fullscreen mode
- `loading="lazy"` - Performance optimization
- `title="Verify+ Overview Video"` - Accessibility
- `aria-label="Verify+ Overview Video"` - Screen readers
- `style={{ border: 0 }}` - Clean styling
- No autoplay enabled (user-initiated)

**Fallback Behavior:**
- If iframe fails to load or is blocked by browser
- Shows gradient poster with play button overlay
- Clicking opens video in new tab (vimeo.com/1148392322)
- Maintains visual consistency

### Button Actions

**Book a Demo:**
- Triggers `onBookDemo()` prop
- Opens DemoBookingModal
- Same behavior as nav button

**Email Us:**
- Mailto link: `mailto:admin@verifytrade.co.nz`
- Opens default email client
- No additional tracking

### Styling Classes Used

**Container:**
- `max-w-[1100px]` - Max width
- `mx-auto` - Center horizontally
- `px-4 sm:px-6 lg:px-8` - Responsive padding
- `mt-12 sm:mt-16` - Top margin spacing

**Card:**
- `rounded-2xl` - 16px corners
- `border border-slate-700/50` - Subtle border
- `shadow-2xl` - Large shadow
- `bg-gradient-to-br from-slate-900/90 to-slate-800/90` - Gradient background
- `backdrop-blur-xl` - Blur effect

**Video:**
- `relative w-full` - Responsive container
- `style={{ paddingTop: '56.25%' }}` - 16:9 ratio
- `absolute top-0 left-0 w-full h-full` - Fill container

**Buttons:**
- Primary: `bg-gradient-to-r from-orange-500 to-orange-600`
- Secondary: `bg-slate-700/50 border border-slate-600/50`
- Hover effects: `hover:scale-[1.02]`, `hover:shadow-orange-500/40`

### File Size Considerations

**No MP4 Upload:**
- Video hosted on Vimeo (external)
- Iframe embed only (minimal code)
- Component file: ~4KB
- No impact on bundle size

**Benefits:**
- Avoids 5MB Bolt limit
- Fast page load (lazy iframe loading)
- Vimeo handles hosting, streaming, analytics
- Easy to update video without code changes
- Professional video player with controls
- Adaptive streaming for all devices

### Accessibility

**ARIA Labels:**
- Iframe has `title="Verify+ Demo Video"`
- Buttons have semantic icons
- Play button has clear visual feedback

**Keyboard Navigation:**
- All interactive elements focusable
- Standard tab order
- Iframe controls accessible

**Screen Readers:**
- Descriptive text for video purpose
- Button labels clear and actionable
- Trust line readable

### Browser Compatibility

**Iframe Support:**
- All modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Fallback for unsupported/blocked iframes

**CSS Features:**
- Backdrop-blur (graceful degradation)
- CSS Grid (fallback to flexbox if needed)
- Gradients (solid color fallback)

### Performance

**Initial Load:**
- Component renders immediately
- Iframe lazy-loads video (loading="lazy")
- No blocking requests
- Improved Core Web Vitals

**Video Loading:**
- Vimeo handles progressive loading
- Adaptive streaming based on connection
- Multiple quality options (auto-selected)
- No impact on page metrics
- Fast playback start

### Testing Checklist

- [x] Component builds without errors
- [x] Iframe embeds correctly
- [x] Fallback triggers on error
- [x] Book Demo button works
- [x] Email button works
- [x] Mobile responsive
- [x] Desktop layout correct
- [x] Hover states work
- [x] Accessibility features present

### Future Enhancements

**Possible Improvements:**
1. Add video analytics tracking
2. Auto-play on scroll (optional)
3. Thumbnail preview before load
4. Multiple video quality options
5. Captions/subtitles toggle
6. Video progress tracking
7. Custom controls overlay

**Not Needed Now:**
- Video analytics already handled by Vimeo
- Auto-play not recommended for UX
- Thumbnail would add file size
- Quality handled by Vimeo adaptive streaming

### Troubleshooting

**Video Not Loading:**
1. Check Vimeo URL is correct (1148392322)
2. Verify iframe not blocked by browser/extensions
3. Check network connection
4. Try fallback (click poster)
5. Check Vimeo video privacy settings (should be public)

**Fallback Always Showing:**
1. Check iframe onError handler
2. Verify Vimeo video is public/unlisted (not private)
3. Test in different browser
4. Check console for errors
5. Disable ad blockers/privacy extensions

**Mobile Layout Issues:**
1. Verify responsive classes
2. Check breakpoints
3. Test on real device
4. Adjust padding if needed

### Support

- **Vimeo Video:** [https://vimeo.com/1148392322](https://vimeo.com/1148392322)
- **Embed URL:** `https://player.vimeo.com/video/1148392322?h=fl`
- **Component:** `src/components/HeroVideo.tsx`
- **Landing Page:** `src/pages/LandingPage.tsx`

### Why Vimeo?

**Professional Features:**
- High-quality video player
- Adaptive streaming (auto-adjusts quality)
- Fast loading & buffering
- Professional playback controls
- Privacy controls available
- No YouTube branding/distractions
- Analytics dashboard
- Embeddable anywhere

**Technical Benefits:**
- CDN-delivered (fast worldwide)
- Mobile-optimized
- Accessibility features built-in
- No cookies by default (privacy-friendly)
- Works with ad blockers
- Reliable uptime

**Perfect for SaaS Landing Pages:**
- Clean, professional appearance
- No competing video recommendations
- Brand-safe environment
- Conversion-optimized player
- Easy video updates
