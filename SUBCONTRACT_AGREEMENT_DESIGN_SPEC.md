# Subcontract Agreement Design Specification

## Current Design Analysis

### Design Theme Inconsistency Identified

**Issue:** The application uses **two different themes** that create a jarring transition:

1. **Contract Manager (Dark Theme)**
   - Background: `bg-slate-900` (#020617)
   - Text: Light colors (slate-300, white)
   - Cards: `bg-slate-900/50` with `border-slate-700`

2. **SubcontractAgreement Editor (Light Theme)**
   - Background: `bg-gray-50` (#f9fafb)
   - Text: Dark colors (gray-900, gray-700)
   - Cards: `bg-white` with `border-gray-200`

### User Experience Impact

When clicking "Open Agreement" button:
```
Dark Theme (Contract Manager)
  ↓ Click "Open Agreement"
Light Theme (SubcontractAgreement)  ← Jarring transition!
```

---

## Design System Specification

### Core Design Tokens

#### Color Palette

**Primary Colors:**
```css
--primary-blue-600: #2563eb
--primary-blue-700: #1d4ed8
--primary-blue-800: #1e40af
--primary-blue-50: #eff6ff
```

**Success Colors:**
```css
--success-green-600: #16a34a
--success-green-700: #15803d
--success-green-50: #f0fdf4
--success-green-800: #166534
```

**Warning Colors:**
```css
--warning-amber-500: #f59e0b
--warning-amber-600: #d97706
--warning-amber-50: #fffbeb
--warning-amber-800: #92400e
```

**Error Colors:**
```css
--error-red-600: #dc2626
--error-red-700: #b91c1c
--error-red-50: #fef2f2
```

**Dark Theme (Contract Manager):**
```css
--dark-bg-primary: #020617     /* slate-950 */
--dark-bg-secondary: #0f172a   /* slate-900 */
--dark-bg-tertiary: #1e293b    /* slate-800 */
--dark-border: #334155          /* slate-700 */
--dark-text-primary: #f8fafc    /* slate-50 */
--dark-text-secondary: #cbd5e1  /* slate-300 */
--dark-text-tertiary: #94a3b8   /* slate-400 */
```

**Light Theme (SubcontractAgreement):**
```css
--light-bg-primary: #ffffff     /* white */
--light-bg-secondary: #f9fafb   /* gray-50 */
--light-bg-tertiary: #f3f4f6    /* gray-100 */
--light-border: #e5e7eb          /* gray-200 */
--light-text-primary: #111827    /* gray-900 */
--light-text-secondary: #4b5563  /* gray-600 */
--light-text-tertiary: #6b7280   /* gray-500 */
```

#### Typography

**Font Family:**
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
```

**Font Sizes:**
```css
--text-xs: 0.75rem      /* 12px */
--text-sm: 0.875rem     /* 14px */
--text-base: 1rem       /* 16px */
--text-lg: 1.125rem     /* 18px */
--text-xl: 1.25rem      /* 20px */
--text-2xl: 1.5rem      /* 24px */
--text-3xl: 1.875rem    /* 30px */
```

**Font Weights:**
```css
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
```

**Line Heights:**
```css
--leading-tight: 1.25
--leading-snug: 1.375
--leading-normal: 1.5
--leading-relaxed: 1.625
```

#### Spacing System (8px base)

```css
--spacing-1: 0.25rem   /* 4px */
--spacing-2: 0.5rem    /* 8px */
--spacing-3: 0.75rem   /* 12px */
--spacing-4: 1rem      /* 16px */
--spacing-6: 1.5rem    /* 24px */
--spacing-8: 2rem      /* 32px */
--spacing-12: 3rem     /* 48px */
--spacing-16: 4rem     /* 64px */
```

#### Border Radius

```css
--radius-sm: 0.375rem   /* 6px */
--radius-md: 0.5rem     /* 8px */
--radius-lg: 0.75rem    /* 12px */
--radius-xl: 1rem       /* 16px */
--radius-full: 9999px   /* circular */
```

#### Shadows

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
```

---

## Component Specifications

### 1. Status Badges

#### Draft Status
```tsx
<span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
  DRAFT
</span>
```

**Dark Theme Version:**
```tsx
<span className="px-3 py-1 rounded text-sm bg-slate-800 text-slate-400 border border-slate-700">
  Draft
</span>
```

**Measurements:**
- Padding: 12px horizontal, 4px vertical
- Font: 14px, medium weight
- Border radius: 9999px (fully rounded)

#### In Review Status
```tsx
<span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
  IN REVIEW
</span>
```

**Dark Theme Version:**
```tsx
<span className="px-3 py-1 rounded text-sm bg-blue-900/30 text-blue-400 border border-blue-700">
  In Review
</span>
```

#### Completed Status
```tsx
<span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
  COMPLETED
</span>
```

**Dark Theme Version:**
```tsx
<span className="px-3 py-1 rounded text-sm bg-green-900/30 text-green-400 border border-green-700">
  Completed
</span>
```

### 2. Action Buttons

#### Primary Button (Save Draft)
```tsx
<button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2">
  <Save className="w-4 h-4" />
  Save Draft
</button>
```

**Measurements:**
- Padding: 16px horizontal, 8px vertical
- Icon size: 16px (w-4 h-4)
- Gap: 8px between icon and text
- Border radius: 8px
- Font: 14px, medium weight
- Transition: 150ms ease

#### Secondary Button (Review & Save)
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
  <AlertCircle className="w-4 h-4" />
  Review & Save
</button>
```

**Measurements:**
- Same as primary button
- Background: Blue (#2563eb)
- Hover: Darker blue (#1d4ed8)

#### Success Button (Complete)
```tsx
<button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
  <CheckCircle className="w-4 h-4" />
  Complete
</button>
```

**Measurements:**
- Same as primary button
- Background: Green (#16a34a)
- Hover: Darker green (#15803d)

### 3. Form Sections

#### Collapsible Section Header
```tsx
<button className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
  <div className="flex items-center gap-3">
    <ChevronDown className="w-5 h-5 text-gray-400" />
    <h3 className="text-lg font-semibold text-gray-900">Contract Identity</h3>
    <CheckCircle2 className="w-5 h-5 text-green-600" />
  </div>
  <div className="flex items-center gap-3">
    <span className="text-sm text-gray-600">0 / 4 required fields</span>
    <div className="w-32 bg-gray-200 rounded-full h-2">
      <div className="h-2 bg-blue-600 rounded-full" style="width: 0%" />
    </div>
  </div>
</button>
```

**Measurements:**
- Padding: 24px horizontal, 16px vertical
- Icon sizes: 20px for chevron, 20px for status icon
- Progress bar: 128px width, 8px height
- Gap between elements: 12px
- Font: 18px semibold for title, 14px regular for counter

#### Section Content Area
```tsx
<div className="px-6 py-4 space-y-6 border-t border-gray-200 bg-gray-50">
  {/* Form fields */}
</div>
```

**Measurements:**
- Padding: 24px horizontal, 16px vertical
- Vertical spacing between fields: 24px
- Background: Gray-50 (#f9fafb)
- Border: Gray-200 (#e5e7eb)

### 4. Form Fields

#### Text Input
```tsx
<input
  type="text"
  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
  placeholder="Enter value"
/>
```

**Measurements:**
- Padding: 16px horizontal, 8px vertical
- Border: 1px solid gray-300
- Border radius: 8px
- Focus ring: 2px blue-500
- Font: 14px

#### Field Label
```tsx
<label className="block text-sm font-medium text-gray-700 mb-2">
  Contract Date <span className="text-red-500">*</span>
</label>
```

**Measurements:**
- Font: 14px, medium weight
- Margin bottom: 8px
- Required indicator: Red asterisk

#### Help Icon
```tsx
<button className="text-gray-400 hover:text-gray-600">
  <HelpCircle className="w-4 h-4" />
</button>
```

**Measurements:**
- Icon size: 16px
- Color: Gray-400, hover Gray-600

### 5. Practical Checklist (Sidebar)

#### Container
```tsx
<div className="w-96 bg-white border border-gray-200 rounded-lg shadow-sm sticky top-6">
```

**Measurements:**
- Width: 384px (w-96)
- Border: 1px solid gray-200
- Border radius: 8px
- Position: Sticky, top offset 24px
- Shadow: Small shadow

#### Header
```tsx
<div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
  <h3 className="text-lg font-semibold text-gray-900 mb-2">Practical Checklist</h3>
  <div className="flex items-center gap-3">
    <div className="flex-1 bg-gray-200 rounded-full h-3">
      <div className="h-3 bg-blue-600 rounded-full" style="width: 0%" />
    </div>
    <div className="text-sm font-medium">
      <span className="text-blue-600">0 / 41</span>
      <span className="text-gray-500 ml-1">(0%)</span>
    </div>
  </div>
</div>
```

**Measurements:**
- Padding: 24px horizontal, 16px vertical
- Progress bar: 12px height, fully rounded
- Font: 18px semibold for title, 14px medium for counter
- Gap: 12px between elements

#### Checklist Item
```tsx
<button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
  <Circle className="w-5 h-5 text-gray-300" />
  <div className="flex-1">
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-gray-900">Contract Identity</span>
      <span className="text-xs text-gray-500">0 / 4</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className="h-1.5 bg-blue-600 rounded-full" style="width: 0%" />
    </div>
  </div>
  <ChevronRight className="w-4 h-4 text-gray-400" />
</button>
```

**Measurements:**
- Padding: 12px all around
- Icon sizes: 20px for status, 16px for chevron
- Progress bar: 6px height
- Font: 14px medium for title, 12px regular for counter
- Gap: 12px between elements

---

## Responsive Design

### Breakpoints

```css
--breakpoint-sm: 640px   /* Mobile landscape */
--breakpoint-md: 768px   /* Tablet */
--breakpoint-lg: 1024px  /* Desktop */
--breakpoint-xl: 1280px  /* Large desktop */
```

### Mobile Layout (< 768px)

1. **Checklist becomes bottom sheet** instead of sidebar
2. **Form sections stack vertically**
3. **Buttons stack in column layout**
4. **Reduced padding:** 16px instead of 24px

### Tablet Layout (768px - 1024px)

1. **Checklist sidebar at 320px width** instead of 384px
2. **Form fields maintain full width**
3. **Button groups remain horizontal**

### Desktop Layout (> 1024px)

1. **Full checklist sidebar at 384px**
2. **Form content at flexible width**
3. **Maximum width container at 1280px**

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

#### Color Contrast Ratios

**Text:**
- Normal text (< 18px): Minimum 4.5:1
- Large text (≥ 18px): Minimum 3:1
- Interactive elements: Minimum 3:1

**Examples:**
```
✅ Gray-900 on White: 16.5:1 (Excellent)
✅ Gray-700 on White: 7.8:1 (Excellent)
✅ Blue-600 on White: 8.5:1 (Excellent)
❌ Gray-400 on White: 2.8:1 (Fails for normal text)
```

#### Keyboard Navigation

1. **All interactive elements focusable:** Tab order follows visual flow
2. **Focus indicators visible:** 2px blue ring on focus
3. **Keyboard shortcuts:**
   - `Ctrl/Cmd + S`: Save draft
   - `Ctrl/Cmd + Enter`: Complete
   - `Escape`: Close modals

#### Screen Reader Support

1. **Semantic HTML:** Use proper heading hierarchy (h1, h2, h3)
2. **ARIA labels:** All icons have descriptive labels
3. **Form labels:** All inputs properly labeled
4. **Status announcements:** Toast notifications announced

---

## Animation & Transitions

### Standard Transitions

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Component Animations

#### Button Hover
```css
transition: background-color 150ms ease;
```

#### Section Expand/Collapse
```css
transition: height 300ms cubic-bezier(0.4, 0, 0.2, 1);
```

#### Progress Bar Fill
```css
transition: width 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

#### Toast Notifications
```css
animation: slideInRight 300ms ease-out;
```

---

## Icons

### Icon Library: Lucide React

**Standard Sizes:**
- Small: 16px (w-4 h-4)
- Medium: 20px (w-5 h-5)
- Large: 24px (w-6 h-6)

**Icons Used:**
- `Save`: Save draft action
- `AlertCircle`: Review/validation
- `CheckCircle`: Complete action
- `CheckCircle2`: Completion status
- `Circle`: Incomplete status
- `ChevronDown`: Expanded section
- `ChevronRight`: Collapsed section / Navigate
- `Eye`: View/preview
- `FileText`: Document reference
- `Lock`: Locked status
- `Loader2`: Loading state
- `HelpCircle`: Help/tooltip

---

## Layout Structure

### SubcontractAgreement Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  PageHeader                                                 │
│  - Title: "{Template Name} - {Subcontractor}"             │
│  - Subtitle: "Agreement {Number}"                          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Max-width Container (1280px, centered, px-4/6/8)          │
│  ┌────────────────────────────────┬────────────────────────┐│
│  │  Main Content (flex-1)         │  Sidebar (w-96)       ││
│  │  ┌──────────────────────────┐  │  ┌──────────────────┐ ││
│  │  │  Status Bar              │  │  │  Checklist       │ ││
│  │  │  - Badge + Buttons       │  │  │  - Progress      │ ││
│  │  └──────────────────────────┘  │  │  - Items         │ ││
│  │  ┌──────────────────────────┐  │  └──────────────────┘ ││
│  │  │  Form Section 1          │  │                        ││
│  │  │  - Collapsible           │  │  (Sticky position)     ││
│  │  │  - Fields                │  │                        ││
│  │  └──────────────────────────┘  │                        ││
│  │  ┌──────────────────────────┐  │                        ││
│  │  │  Form Section 2          │  │                        ││
│  │  └──────────────────────────┘  │                        ││
│  │  ┌──────────────────────────┐  │                        ││
│  │  │  Form Section 3          │  │                        ││
│  │  └──────────────────────────┘  │                        ││
│  └────────────────────────────────┴────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Grid System

**Gap Sizes:**
- Small gap: 8px (`gap-2`)
- Medium gap: 12px (`gap-3`)
- Large gap: 16px (`gap-4`)
- Extra large gap: 24px (`gap-6`)

---

## Design Inconsistency Resolution

### Recommendation: Unified Dark Theme

To maintain consistency with the Contract Manager, the SubcontractAgreement editor should also use the dark theme.

#### Proposed Changes:

**1. Background Color**
```tsx
// Current
<div className="min-h-screen bg-gray-50">

// Proposed
<div className="min-h-screen bg-slate-900">
```

**2. Card Backgrounds**
```tsx
// Current
<div className="bg-white border border-gray-200 rounded-lg shadow-sm">

// Proposed
<div className="bg-slate-800/50 border border-slate-700 rounded-lg shadow-lg">
```

**3. Text Colors**
```tsx
// Current
<h3 className="text-gray-900">Section Title</h3>
<p className="text-gray-600">Description</p>

// Proposed
<h3 className="text-slate-50">Section Title</h3>
<p className="text-slate-300">Description</p>
```

**4. Form Fields**
```tsx
// Current
<input className="border-gray-300 bg-white text-gray-900" />

// Proposed
<input className="border-slate-600 bg-slate-700 text-slate-50" />
```

**5. Status Badges**
Use the dark theme versions specified above.

**6. Progress Bars**
```tsx
// Current
<div className="bg-gray-200"><div className="bg-blue-600" /></div>

// Proposed
<div className="bg-slate-700"><div className="bg-blue-500" /></div>
```

### Alternative: Keep Light Theme but Improve Transition

If maintaining the light theme for better readability of forms:

1. **Add transition screen:**
   ```
   Dark Theme → Fade transition (300ms) → Light Theme
   ```

2. **Add visual indicator:**
   ```tsx
   <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-gray-50 h-20" />
   ```

3. **Update back button styling:**
   ```tsx
   <button className="bg-slate-900 text-white px-4 py-2 rounded-t-lg">
     ← Back to Contract Manager
   </button>
   ```

---

## Implementation Checklist

### Design Consistency

- [ ] Verify all colors match design tokens
- [ ] Check all font sizes and weights
- [ ] Validate spacing follows 8px grid
- [ ] Ensure border radius consistency
- [ ] Test all interactive states (hover, focus, active)

### Responsive Design

- [ ] Test on mobile devices (< 768px)
- [ ] Test on tablets (768px - 1024px)
- [ ] Test on desktop (> 1024px)
- [ ] Verify checklist sidebar behavior
- [ ] Check button stack behavior

### Accessibility

- [ ] Run WAVE accessibility checker
- [ ] Test with screen reader (NVDA/JAWS)
- [ ] Verify keyboard navigation
- [ ] Check color contrast ratios
- [ ] Test with high contrast mode

### Performance

- [ ] Lazy load form sections
- [ ] Optimize re-renders on field change
- [ ] Debounce auto-save functionality
- [ ] Minimize bundle size

---

## Design Tokens (CSS Variables)

### Implementation

Create a `design-tokens.css` file:

```css
:root {
  /* Colors - Primary */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;

  /* Colors - Success */
  --color-success-50: #f0fdf4;
  --color-success-600: #16a34a;
  --color-success-700: #15803d;

  /* Colors - Warning */
  --color-warning-50: #fffbeb;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;

  /* Colors - Error */
  --color-error-50: #fef2f2;
  --color-error-600: #dc2626;
  --color-error-700: #b91c1c;

  /* Colors - Dark Theme */
  --color-dark-bg-primary: #020617;
  --color-dark-bg-secondary: #0f172a;
  --color-dark-bg-tertiary: #1e293b;
  --color-dark-border: #334155;
  --color-dark-text-primary: #f8fafc;
  --color-dark-text-secondary: #cbd5e1;

  /* Colors - Light Theme */
  --color-light-bg-primary: #ffffff;
  --color-light-bg-secondary: #f9fafb;
  --color-light-bg-tertiary: #f3f4f6;
  --color-light-border: #e5e7eb;
  --color-light-text-primary: #111827;
  --color-light-text-secondary: #4b5563;

  /* Spacing */
  --spacing-xs: 0.25rem;  /* 4px */
  --spacing-sm: 0.5rem;   /* 8px */
  --spacing-md: 1rem;     /* 16px */
  --spacing-lg: 1.5rem;   /* 24px */
  --spacing-xl: 2rem;     /* 32px */

  /* Typography */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;

  /* Border Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Summary

### Current State
- ✅ Well-structured component architecture
- ✅ Comprehensive form validation
- ✅ Progress tracking with checklist
- ✅ Responsive layout foundations
- ❌ Theme inconsistency (dark vs light)
- ❌ Missing design token system

### Recommendations
1. **Immediate:** Unify theme (prefer dark for consistency)
2. **Short-term:** Implement design tokens
3. **Medium-term:** Add transitions between views
4. **Long-term:** Create comprehensive design system library

### Design Quality Score
- **Visual Consistency:** 7/10 (theme mismatch)
- **Component Design:** 9/10 (excellent structure)
- **Accessibility:** 8/10 (good but can improve)
- **Responsiveness:** 8/10 (solid foundations)
- **User Experience:** 9/10 (intuitive flow)

**Overall: 8.2/10** - Well-designed with minor theme inconsistency issue.
