# Responsive Enhancement Plan

## Overview
RouteCoinMe currently optimizes for wide desktop layouts. This plan captures the responsive strategy to ensure the app remains usable and polished on tablets and mobile devices while preserving core functionality.

## Objectives
- Deliver a mobile-first experience without sacrificing desktop capabilities.
- Ensure critical workflows (uploading, aggregating, visualizing) remain discoverable at narrow widths.
- Preserve privacy and local-first messaging while adjusting layout hierarchy.
- Maintain accessibility for keyboard and screen-reader users across breakpoints.

## Breakpoints & Layout Priorities
- **Desktop (≥1024px):** Preserve two-column aggregation layout and hero feature cards. Sidebar remains persistent.
- **Tablet (768–1023px):** Collapse aggregation layout to single column, convert stats to two-column grid, and introduce off-canvas sidebar behavior.
- **Mobile (<768px):** Prioritize upload/visualization content, stack hero elements, move or hide non-essential decorative sections, and present sidebar as slide-out drawer with prominent toggle.

## Header & Navigation
- Rework header to be mobile-first: stacked logo/actions under 768px, with optional hamburger menu for secondary controls.
- Keep Strava connect and unit toggle accessible via collapsible action tray.
- Adjust sticky behavior to avoid dominating vertical space on mobile.

## Hero & Feature Cards
- Scale headline/body typography for readability at small sizes.
- Reorder layout so upload CTA appears quickly on mobile.
- Convert feature cards into a horizontal scroll carousel or relocate below demo area on narrow viewports; optionally hide lower-priority cards with "More features" toggle.

## Aggregation Layout & Visualization
- Use single-column flow below 1100px (refine existing media queries).
- Compress vertical spacing and allow map/3D viewer heights to adapt using `clamp()` so they remain visible without overwhelming the viewport.
- Reposition map/3D controls for thumb reachability and enlarge tap targets.

## Sidebar Transformation
- Implement an off-canvas drawer for `#aggregation-sidebar` starting around 1024px.
- Add a "Coin Controls" toggle near visualization header; clicking opens slide-in panel with overlay and close gesture (tap overlay, swipe, or ESC).
- Maintain focus management and aria attributes for accessibility.

## Lists, Tabs, and Actions
- Allow `.list-tabs` to scroll horizontally on overflow; ensure tab hit areas are finger-friendly.
- Stack buttons vertically on narrow screens, ensuring minimum 44px tap height.
- Adjust `.route-stats` to two-column grid on tablets and single-column or swipeable row on mobile.

## Modals & Miscellaneous
- Ensure privacy/terms modals become full-screen dialogs on phones with comfortable padding and close controls.
- Review typography scale tokens and line-heights for mobile readability (e.g., 16px base body, 20px headings).
- Audit spacing to keep key actions above the fold on small devices.

## Implementation Phases
1. **Design Review & Wireframes**
   - Produce tablet/mobile wireframes capturing new layout hierarchy and sidebar behavior.
   - Confirm priority content ordering with stakeholders.

2. **Layout Foundations**
   - Implement responsive CSS adjustments (header, hero, aggregation layout, stats, tabs).
   - Introduce off-canvas sidebar structure (hidden by default, toggle button + overlay).

3. **Interactive Enhancements**
   - Add JavaScript to manage drawer animations, focus trapping, and touch gestures.
   - Update visualization components to respond to container resize events if necessary.
   - Verify Strava/auth controls remain accessible across breakpoints.

4. **Polish & QA**
   - Test across major devices/browsers (iOS Safari, Android Chrome, desktop resize).
   - Validate accessibility (keyboard access, aria attributes, color contrast).
   - Update documentation (README screenshots, feature descriptions) as needed.

---
This document serves as the roadmap for converting RouteCoinMe into a responsive, mobile-friendly application while preserving its privacy-first ethos and rich visualization features.