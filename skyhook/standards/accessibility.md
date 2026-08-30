# Skyhook Built-in Accessibility Standards

## Purpose

Detailed accessibility requirements beyond the UX standards baseline.
Target: **WCAG 2.1 Level AA** minimum, **AAA** for public-facing content.

---

## 1. Perceivable

### 1.1 Text Alternatives

```yaml
textAlternatives:
  images:
    - All <img> have alt attribute
    - Decorative images: alt=""
    - Informative images: descriptive alt text
    - Complex images (charts, diagrams): long description or data table
    - Icons with text: alt="" (text provides meaning)
    - Icons alone: aria-label or aria-labelledby
  
  media:
    - Audio: transcript
    - Video: captions (synchronized)
    - Live audio: real-time captions
    - Pre-recorded video: audio description
```

### 1.2 Time-based Media

```yaml
timeBasedMedia:
  - Captions for all pre-recorded audio
  - Audio description for all pre-recorded video
  - Captions for live audio
  - Sign language for pre-recorded (AAA)
  - Extended audio description (AAA)
  - Media alternative for text (AAA)
```

### 1.3 Adaptable

```yaml
adaptable:
  - Content structure programmatically determinable
  - Meaningful sequence (reading order)
  - Instructions not sensory-only
  - Responsive: no horizontal scroll at 320px width
  - Text spacing override support (line height 1.5, paragraph 2x, letter 0.12x, word 0.16x)
```

### 1.4 Distinguishable

```yaml
distinguishable:
  color:
    - Color not sole conveyor of information
    - Links in text: 3:1 contrast + non-color indicator (underline)
    - Focus indicators: 3:1 against adjacent colors
  
  audio:
    - Auto-play audio > 3s: pause/stop control or volume
  
  contrast:
    - Text: 4.5:1 (AA), 7:1 (AAA)
    - Large text (18pt+/14pt+ bold): 3:1 (AA), 4.5:1 (AAA)
    - UI components: 3:1
    - Graphics: 3:1
  
  resize:
    - Text resizable to 200% without assistive tech
    - No loss of content/functionality
  
  imagesOfText:
    - Avoid images of text (use real text)
    - Exception: logos, essential branding
  
  reflow:
    - Content reflows to 320px width (256 CSS pixels)
    - No two-dimensional scrolling
  
  textSpacing:
    - Support user text spacing overrides
    - No loss of content/functionality
  
  contentOnHover:
    - Hover/focus content: dismissible, hoverable, persistent
```

---

## 2. Operable

### 2.1 Keyboard Accessible

```yaml
keyboardAccessible:
  - All functionality via keyboard
  - No keyboard traps
  - Tab order logical
  - Focus visible (2px solid, 2px offset minimum)
  - Skip to main content link
  - No timed keystrokes required
  - Character key shortcuts: disable, remap, or focus-only
```

### 2.2 Enough Time

```yaml
enoughTime:
  - Adjustable time limits (off, 10x, extend)
  - Pause/stop/hide moving/blinking/scrolling > 5s
  - Auto-update: pause/stop/hide or frequency control
  - Interruptions postponable/suppressible (except emergency)
  - Re-authentication: data preserved
  - Timeout warning: 20s minimum, simple extend
```

### 2.3 Seizures and Physical Reactions

```yaml
seizures:
  - No content flashes > 3x per second
  - Flash threshold: general & red flash
  - Animation from interactions: disable option
```

### 2.4 Navigable

```yaml
navigable:
  - Skip blocks (navigation, header)
  - Page titles descriptive
  - Focus order meaningful
  - Link purpose from link text alone (or context)
  - Multiple ways to find pages (search, nav, sitemap)
  - Headings and labels descriptive
  - Focus visible
  - Location indicators (breadcrumbs, nav highlight)
  - Headings for content sections
```

### 2.5 Input Modalities

```yaml
inputModalities:
  pointer:
    - No single-pointer gestures (unless essential)
    - Pointer cancellation (up-event reversal)
    - Label in name (accessible name contains visible label)
    - Motion actuation: alternative, disable option
  
  targetSize:
    - Minimum 44x44 CSS pixels (AA)
    - Minimum 48x48 CSS pixels (AAA)
  
  concurrentInput:
    - No input modality restriction
```

---

## 3. Understandable

### 3.1 Readable

```yaml
readable:
  - Page language declared
  - Part language declared
  - Unusual words: definition available
  - Abbreviations: expansion available
  - Reading level: lower secondary (AAA)
  - Pronunciation: available for ambiguous words (AAA)
```

### 3.2 Predictable

```yaml
predictable:
  - No context change on focus
  - No context change on input (unless warned)
  - Consistent navigation
  - Consistent identification
  - Change on request (user initiated)
```

### 3.3 Input Assistance

```yaml
inputAssistance:
  errorIdentification:
    - Errors identified, described in text
    - Error location indicated
  
  labelsInstructions:
    - Labels for all inputs
    - Instructions for format/constraints
  
  errorSuggestion:
    - Correction suggestions (if known)
  
  errorPrevention:
    - Reversible submissions
    - Data checked, confirmation before submit
    - Confirmation mechanism for legal/financial/data
  
  help:
    - Context-sensitive help (AAA)
```

---

## 4. Robust

### 4.1 Compatible

```yaml
compatible:
  - Valid HTML (parseable)
  - Name, role, value for all UI components
  - Status messages: role="status" or aria-live
  - Custom components: proper ARIA
```

---

## 5. Component-Specific Requirements

### Buttons

```yaml
button:
  - <button> or role="button" with keyboard support
  - Accessible name (text content or aria-label)
  - Disabled: aria-disabled="true" (not disabled attr for custom)
  - Loading: aria-busy="true" + aria-live announcement
```

### Links

```yaml
link:
  - <a href> for navigation
  - Button for actions
  - Accessible name describes destination
  - Distinct from surrounding text (underline or 3:1 contrast)
```

### Forms

```yaml
forms:
  - <label for="id"> or aria-labelledby/aria-label
  - Required: aria-required="true" + visual indicator
  - Invalid: aria-invalid="true" + aria-describedby error
  - Error message: role="alert" or aria-live="polite"
  - Fieldset/legend for groups
  - Autocomplete attributes for personal info
```

### Tables

```yaml
tables:
  - <table> with <caption>
  - <th scope="col|row"> for headers
  - Complex tables: id/headers attributes
  - Sortable: aria-sort on header
```

### Modals/Dialogs

```yaml
modals:
  - role="dialog" or <dialog>
  - aria-modal="true"
  - aria-labelledby="title-id"
  - Focus trapped
  - Focus returns to trigger on close
  - Escape closes
  - Background inert (aria-hidden or inert)
```

### Navigation

```yaml
navigation:
  - <nav> with aria-label
  - Current page: aria-current="page"
  - Dropdown: aria-expanded, aria-controls
  - Mega menu: proper heading structure
  - Breadcrumb: <nav aria-label="Breadcrumb"> + ol
```

### Live Regions

```yaml
liveRegions:
  - Toast: role="status" aria-live="polite"
  - Error: role="alert" aria-live="assertive"
  - Progress: role="progressbar" aria-valuenow/min/max
  - Timer: role="timer"
```

---

## 6. Testing Requirements

### Automated Testing

```yaml
automated:
  tools:
    - axe-core (CI integration)
    - eslint-plugin-jsx-a11y
    - @storybook/addon-a11y
    - pa11y (CI)
  
  coverage:
    - All pages/components
    - Run on every PR
    - Fail on violations
```

### Manual Testing

```yaml
manual:
  checklist:
    - [ ] Tab through entire application
    - [ ] All interactive elements reachable
    - [ ] Focus indicators visible
    - [ ] Screen reader (NVDA/VoiceOver) - key flows
    - [ ] Zoom 200% - no horizontal scroll
    - [ ] High contrast mode
    - [ ] Reduced motion - animations disabled
    - [ ] Disable CSS - reading order logical
    - [ ] Mobile: touch targets 44x44px
    - [ ] Mobile: pinch zoom works
```

### Regression Testing

```yaml
regression:
  - a11y snapshot tests for components
  - CI gate on new violations
  - Monthly full manual audit
```

---

## 7. Documentation

### Required Artifacts

```yaml
documentation:
  - Accessibility statement (public sites)
  - Conformance claim (WCAG 2.1 AA)
  - Known issues / roadmap
  - Contact for accessibility feedback
  - VPAT (for enterprise/procurement)
```

---

## Override Mechanism

Create `.skyhook/standards/accessibility.md`:

```markdown
# Project Accessibility Standards Overrides

## Overrides

### Target Level
- Target: WCAG 2.1 AAA (public marketing pages)
- Target: WCAG 2.1 AA (authenticated dashboard)

### Exceptions
- Data visualizations: provide data table alternative
- Third-party embeds: document limitations
- Legacy browser support: IE11 not required
```

---

## Version

**Skyhook Accessibility Standards v1.0.0**

*Reference: WCAG 2.1 Quick Reference: https://www.w3.org/WAI/WCAG21/quickref/*
