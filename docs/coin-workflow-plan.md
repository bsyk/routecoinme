# Coin Workflow Redesign Plan

## Objectives
- Unify the workflow around a single "View Coin" action triggered from the sidebar controls.
- Keep the map/View Coin visualization visible while manipulating aggregation settings and lists.
- Provide clear separation between source routes and saved coins, with dedicated display behaviors.
- Support saving, loading, downloading, and deleting coins with distinct metadata and storage semantics.

## Layout & UX
- **Visualization Area**: Remains at the top of the main column (map by default, View Coin renders the 3D scene when active) and defaults to 3D when a saved coin is opened.
- **Lists Panel**: Single container beneath the visualization with tab buttons to switch between `Routes` (blue accent) and `Saved Coins` (orange accent with coin emoji); auto-scroll the active list to keep selected items visible.
   - `Routes` tab uses checkboxes for aggregation input and mirrors current selection behaviour.
   - `Saved Coins` tab supports single selection, shows metadata (including summed distance/elevation), and exposes download/delete icons; no checkboxes.
- **Sidebar Controls**: Dedicated to aggregation options and actions.
   - Elevation mode radios (`Actual` default, `Cumulative`).
   - Overlay selector dropdown with `Real` plus predetermined fictional overlays (spiral, switchbacks, semi-circle, etc.).
   - Domain radios (`Distance` default, `Time` greyed and auto-reverted unless a fictional overlay is chosen).
   - View toggle buttons (`Map`, `View Coin`) replace the old make/3D flow; selecting `View Coin` triggers aggregation with current options and switches the visualization.
   - Buttons: `Save Coin`, `Download My Coin`, plus `Clear Coin` (shown when a saved coin is active).

## Aggregation Behavior
- Recalculate aggregation whenever route selections or sidebar options change.
- Always sort selected routes chronologically by start time.
- Append routes sequentially in 3D space; preserve existing elevation scaling logic.
- Fictional overlays apply the selected predetermined path; if `Time` domain is active, redistribute cumulative elevation gain over evenly spaced time buckets before mapping onto the overlay.
- Single-route selections are valid for coin creation and reuse their original name by default.

## Saved Coin Handling
- Saved coins are read-only for aggregation but fully displayable.
- Selecting a coin from the tab deselects all routes, loads its stored geometry/options, disables aggregation controls (except view toggle and download), and shows coin metadata.
- Provide `Clear Coin` action to return to route selection mode.
- Use orange accent bar, coin emoji, and metadata summary to differentiate coin entries.

## Naming Rules
- When multiple routes are aggregated, default prompt text to `Coin – <YYYY-MM-DD HH:MM>`.
- When a single route is aggregated, prepopulate prompt with that route's filename/title.
- Users can override the suggested name before saving.

## Persistence Requirements
- Extend IndexedDB storage (via existing storage layer) with a `coins` store.
- Coin record should include:
  - `id`, `name`, `createdAt`
  - Serialized aggregated geometry and statistics
  - Aggregation options used
  - Source route IDs and metadata
  - `type: 'coin'` flag for quick identification
- Load saved coins on startup, merging into the `Saved Coins` list while keeping routes separate.

## File & Code Touchpoints
- `src/ui/file-upload.js`: Major refactor for sidebar controls, list rendering, state management, coin save/load/delete actions, and prompt handling.
- `src/styles/main.css`: New layout rules for sidebar, tabbed list container, color accents, auto-scroll containers, and button states.
- `src/data/route-manipulator.js`: Ensure chronological sorting and sequential appending; extend fictional/time logic as needed.
- `src/data/route-storage.js`: Add coin persistence APIs (save, load, delete) using IndexedDB.
- `src/visualization/route-map.js` & `src/visualization/route-3d.js`: Accept updates when aggregation or saved coin selection changes; support clear vs coin modes.
- `src/main.js`: Wire new initialization hooks if required.
- `index.html`: Introduce structural HTML for sidebar, tab container, and controls to minimize runtime DOM replacement.
- `test/data/route-manipulator.test.js`: Add coverage for new aggregation combinations and sorting requirements.
- Additional tests for storage behaviors (new test file or extension of existing storage tests).

## Implementation Steps
1. **Sidebar & Layout Restructure**
   - Introduce sidebar component housing aggregation controls and actions.
   - Refactor the area below the visualization into a tabbed container for routes and saved coins, with HTML scaffolding in `index.html`.
2. **State Model Updates**
   - Track `aggregationOptions`, `selectedRouteIds`, `aggregatedRoute`, `activeCoin`, and `currentView` in `FileUploadHandler`.
   - Implement `refreshAggregatedRoute()` that reacts to options or selection changes.
3. **Aggregation Logic Adjustments**
   - Ensure chronological sorting and sequential appending in route manipulator.
   - Add fictional+time elevation redistribution before overlay application.
   - Support overlay selection via dropdown, pulling predetermined path metadata.
4. **Saved Coin Workflow**
   - Implement `Save Coin` prompt logic with default naming rules.
   - Persist coin records; update UI lists and disable aggregation controls when viewing a coin.
   - Implement download and delete actions for saved coins.
5. **Visualization Updates**
   - Allow map and 3D visualizations to swap between aggregated routes and saved coins.
   - Maintain `Map` vs `View Coin` state across selections.
6. **Styling & UX Polish**
   - Apply blue/orange accent bars, coin emoji, disabled states, tooltips for greyed options, and auto-scroll behavior.
7. **Testing & Validation**
   - Extend unit tests for aggregation logic and storage interactions.
   - Manual QA: multi-route aggregation, single-route coin naming, fictional overlay dropdown, fictional+time mode, coin save/load/delete, download GPX, tab switching.

## Open Questions
- Confirm additional metadata formatting (icons, typography) for the tabbed lists.
- Determine exact trigger for defaulting back to `Map` view after clearing a coin.
