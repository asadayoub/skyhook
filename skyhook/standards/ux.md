# Skyhook Built-in UX/UI Standards

## Purpose

Opinionated but overridable standards for user experience, design systems, and interface quality.
These are **defaults** — projects can override in `.skyhook/standards/ux.md`.

## Core Principles

1. **Accessibility first** — WCAG 2.1 AA is the baseline, not a stretch goal
2. **Consistency through systems** — Design tokens, not one-off values
3. **Performance is UX** — Fast, responsive interfaces respect users
4. **Predictable patterns** — Familiar patterns reduce cognitive load
5. **Graceful degradation** — Works without JS, on slow connections, on old devices

---

## 1. Design Token System

### Required Token Categories

```yaml
# All projects must define these token categories
requiredTokens:
  - color
  - spacing
  - typography
  - borderRadius
  - shadows
  - transitions
  - zIndex
  - breakpoints
```

### Color System

```yaml
color:
  palette:
    # Base palette (10 shades each)
    - neutral: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    - primary: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    - secondary: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    - success: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
    - warning: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
    - error: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
    - info: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
  
  semantic:
    # Light mode mappings
    light:
      background: "neutral.50"
      surface: "white"
      surfaceElevated: "white"
      border: "neutral.200"
      borderStrong: "neutral.300"
      textPrimary: "neutral.950"
      textSecondary: "neutral.600"
      textMuted: "neutral.400"
      textInverse: "white"
      primary: "primary.600"
      primaryHover: "primary.700"
      primaryActive: "primary.800"
      primaryForeground: "white"
      secondary: "secondary.600"
      success: "success.600"
      warning: "warning.600"
      error: "error.600"
      focusRing: "primary.500"
    
    # Dark mode mappings (REQUIRED)
    dark:
      background: "neutral.950"
      surface: "neutral.900"
      surfaceElevated: "neutral.800"
      border: "neutral.700"
      borderStrong: "neutral.600"
      textPrimary: "neutral.50"
      textSecondary: "neutral.400"
      textMuted: "neutral.500"
      textInverse: "neutral.950"
      primary: "primary.400"
      primaryHover: "primary.300"
      primaryActive: "primary.200"
      primaryForeground: "neutral.950"
      secondary: "secondary.400"
      success: "success.400"
      warning: "warning.400"
      error: "error.400"
      focusRing: "primary.400"
```

### Spacing Scale

```yaml
spacing:
  # Base unit: 4px (0.25rem)
  scale:
    0: "0"
    1: "0.25rem"   # 4px
    2: "0.5rem"    # 8px
    3: "0.75rem"   # 12px
    4: "1rem"      # 16px
    5: "1.25rem"   # 20px
    6: "1.5rem"    # 24px
    8: "2rem"      # 32px
    10: "2.5rem"   # 40px
    12: "3rem"     # 48px
    16: "4rem"     # 64px
    20: "5rem"     # 80px
    24: "6rem"     # 96px
  
  semantic:
    none: "0"
    xs: "1"      # 4px
    sm: "2"      # 8px
    md: "4"      # 16px
    lg: "6"      # 24px
    xl: "8"      # 32px
    2xl: "12"    # 48px
    3xl: "16"    # 64px
```

### Typography Scale

```yaml
typography:
  fontFamilies:
    sans: "Inter, system-ui, -apple-system, sans-serif"
    mono: "JetBrains Mono, Fira Code, monospace"
    serif: "Georgia, serif"
    display: "Cal Sans, Inter, sans-serif"
  
  scale:
    # Fluid typography using clamp()
    displayLarge:    { size: "clamp(3rem, 5vw + 1rem, 4.5rem)", weight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }
    displayMedium:   { size: "clamp(2.25rem, 4vw + 0.5rem, 3.5rem)", weight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" }
    displaySmall:    { size: "clamp(1.875rem, 3vw + 0.5rem, 2.5rem)", weight: 600, lineHeight: 1.3 }
    headlineLarge:   { size: "clamp(1.5rem, 2vw + 0.5rem, 2rem)", weight: 600, lineHeight: 1.3 }
    headlineMedium:  { size: "clamp(1.25rem, 1.5vw + 0.5rem, 1.5rem)", weight: 600, lineHeight: 1.4 }
    headlineSmall:   { size: "clamp(1.125rem, 1vw + 0.5rem, 1.25rem)", weight: 600, lineHeight: 1.4 }
    titleLarge:      { size: "1.125rem", weight: 600, lineHeight: 1.5 }
    titleMedium:     { size: "1rem", weight: 600, lineHeight: 1.5 }
    titleSmall:      { size: "0.875rem", weight: 600, lineHeight: 1.5 }
    bodyLarge:       { size: "1.125rem", weight: 400, lineHeight: 1.6 }
    bodyMedium:      { size: "1rem", weight: 400, lineHeight: 1.6 }
    bodySmall:       { size: "0.875rem", weight: 400, lineHeight: 1.5 }
    labelLarge:      { size: "0.875rem", weight: 500, lineHeight: 1.5 }
    labelMedium:     { size: "0.75rem", weight: 500, lineHeight: 1.5, letterSpacing: "0.05em" }
    labelSmall:      { size: "0.75rem", weight: 500, lineHeight: 1.5, letterSpacing: "0.05em" }
  
  semantic:
    heading1: "displayLarge"
    heading2: "displayMedium"
    heading3: "displaySmall"
    heading4: "headlineLarge"
    heading5: "headlineMedium"
    heading6: "headlineSmall"
    body: "bodyMedium"
    bodyStrong: "bodyLarge"
    caption: "bodySmall"
    button: "labelLarge"
    input: "bodyMedium"
```

---

## 2. Component Standards

### Required Base Components

```yaml
components:
  primitives:
    - Box
    - Flex
    - Grid
    - Text
    - Heading
    - Link
    - Image
    - Icon
  
  interactive:
    - Button (primary, secondary, ghost, destructive, link)
    - ButtonGroup
    - Checkbox
    - Radio
    - Switch
    - Select
    - TextInput
    - TextArea
    - Label
  
  feedback:
    - Alert (info, success, warning, error)
    - Toast
    - Modal
    - Dialog
    - Popover
    - Tooltip
    - Spinner
    - Skeleton
    - Progress
  
  navigation:
    - Breadcrumb
    - Tabs
    - Pagination
    - Stepper
    - NavigationMenu
  
  data:
    - Table
    - Card
    - List
    - Badge
    - Avatar
    - Divider
```

### Component API Standards

```typescript
// ✅ Good: Consistent, typed, accessible
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
}

// ❌ Bad: Inconsistent, loose types
interface ButtonProps {
  type?: string;
  style?: any;
  onClick?: () => void;
  children: any;
}
```

### State Variants (All Interactive Components)

```yaml
states:
  - default
  - hover
  - focus
  - focusVisible
  - active
  - disabled
  - loading
  - error
  - success
```

---

## 3. Accessibility Standards (WCAG 2.1 AA)

### Required Practices

```yaml
accessibility:
  # Color & Contrast
  contrast:
    normalText: 4.5:1
    largeText: 3:1
    uiComponents: 3:1
    graphics: 3:1
  
  # Keyboard Navigation
  keyboard:
    - All interactive elements reachable
    - Visible focus indicators (2px minimum, offset 2px)
    - Logical tab order
    - Skip links for main content
    - Escape to close modals/dropdowns
    - Arrow keys for composite widgets
  
  # Screen Readers
  screenReader:
    - Semantic HTML (header, nav, main, section, article, aside, footer)
    - Heading hierarchy (h1 → h2 → h3, no skipping)
    - Landmarks labeled
    - Form labels associated (htmlFor / aria-labelledby)
    - Error messages linked (aria-describedby)
    - Live regions for dynamic content
    - ARIA only when native HTML insufficient
  
  # Motion & Animation
  motion:
    - Respect prefers-reduced-motion
    - No auto-playing animation > 5s
    - Pause/stop/hide controls for moving content
    - Transitions < 200ms for micro-interactions
  
  # Touch Targets
  touchTargets:
    minimum: "44x44px"
    recommended: "48x48px"
    spacing: "8px minimum between targets"
```

### Testing Checklist

```yaml
a11yTesting:
  automated:
    - axe-core in CI
    - eslint-plugin-jsx-a11y
    - Storybook a11y addon
  
  manual:
    - Tab through entire app
    - Screen reader (NVDA/VoiceOver) test
    - Zoom to 200% (no horizontal scroll)
    - High contrast mode
    - Disable CSS (check reading order)
```

---

## 4. Responsive Design

### Breakpoint System

```yaml
breakpoints:
  scale:
    xs: "0px"      # Mobile first
    sm: "640px"    # Large phone / small tablet
    md: "768px"    # Tablet
    lg: "1024px"   # Desktop
    xl: "1280px"   # Large desktop
    2xl: "1536px"  # Ultra-wide
  
  semantic:
    mobile: "xs"
    tablet: "md"
    desktop: "lg"
    wide: "xl"
```

### Container Queries (Preferred over Media Queries)

```css
/* ✅ Good: Container-based */
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 1fr 1fr; }
}

/* ⚠️ Acceptable: Viewport-based for layout */
@media (min-width: 768px) {
  .page-layout { display: grid; grid-template-columns: 250px 1fr; }
}
```

---

## 5. Performance Standards

### Core Web Vitals Targets

```yaml
performance:
  lcp: "< 2.5s"      # Largest Contentful Paint
  fid: "< 100ms"     # First Input Delay
  cls: "< 0.1"       # Cumulative Layout Shift
  ttfb: "< 800ms"    # Time to First Byte
  inp: "< 200ms"     # Interaction to Next Paint
```

### Bundle Budgets

```yaml
bundleBudgets:
  initialJS: "100kb gzipped"
  initialCSS: "50kb gzipped"
  totalJS: "300kb gzipped"
  fonts: "100kb total"
  images: "Optimized, WebP/AVIF, responsive"
```

### Loading Patterns

```yaml
loadingPatterns:
  - Skeleton screens for content areas
  - Progressive image loading (blur → sharp)
  - Route-level code splitting
  - Component-level lazy loading (below fold)
  - Prefetch on hover/intent
  - Service worker for offline/caching
```

---

## 6. Form UX Standards

### Form Patterns

```yaml
forms:
  validation:
    - Validate on blur (not on change)
    - Show error on submit attempt
    - Clear error on correction
    - Inline error messages
    - ARIA: aria-invalid, aria-describedby
  
  layout:
    - Single column (except related fields: name, date, address)
    - Labels above inputs (not placeholder-only)
    - Required indicator on label
    - Help text below input
  
  submission:
    - Disable submit during processing
    - Show loading state
    - Success feedback (toast + redirect or inline)
    - Error recovery (preserve input)
```

---

## 7. Empty & Error States

### Required States

```yaml
states:
  empty:
    - Illustration/icon
    - Clear heading
    - Helpful description
    - Primary action (create, import, etc.)
    - Secondary action (learn more, browse templates)
  
  error:
    - Friendly heading ("Something went wrong")
    - Non-technical explanation
    - Actionable next step (retry, contact support, go back)
    - Error code/reference for support
  
  loading:
    - Skeleton for known structure
    - Spinner for unknown duration
    - Progress for determinate operations
```

---

## 8. Dark Mode

### Requirements

```yaml
darkMode:
  required: true
  implementation: "CSS custom properties + media query"
  toggle: "System preference default, manual override persisted"
  images: "Provide dark variants or use filters"
  charts: "Color-blind safe palettes in both modes"
```

---

## 9. Internationalization (i18n) Ready

```yaml
i18n:
  - No hardcoded strings in components
  - Use translation keys: t('button.save')
  - Support RTL layouts (logical properties: margin-inline-start)
  - Date/number formatting via Intl API
  - Font fallbacks for CJK, Arabic scripts
```

---

## Override Mechanism

Create `.skyhook/standards/ux.md`:

```markdown
# Project UX Standards Overrides

## Overrides

### Color
- Primary color: #0066CC (brand requirement)
- No dark mode (internal tool only)

### Components
- Use Radix UI primitives instead of custom
- Add DataTable component for admin

### Accessibility
- Target: WCAG 2.1 AAA for public pages
```

---

## Version

**Skyhook UX Standards v1.0.0**

*Check `skyhook standards ux` for latest.*
