# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RouteCoinMe is a GPS route aggregation and 3D visualization web application. It processes GPX files and creates fictional, aggregated routes with preserved elevation data, focusing on cumulative climbing visualization with sophisticated route generation algorithms.

**Tech Stack:**
- Frontend: Vanilla JavaScript (ES modules), Three.js (3D), Leaflet (2D maps), D3.js (data)
- Build: Vite (dev server on port 3000)
- Backend: Cloudflare Workers (Strava OAuth + API proxy)
- Testing: Vitest with jsdom

## Development Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server (port 3000, auto-opens)
npm run build           # Production build to dist/
npm run preview         # Preview production build

# Testing
npm test                # Run tests in watch mode
npm run test:ui         # Run tests with UI
npm run test:run        # Run tests once (CI mode)

# Deployment (Cloudflare)
npm run deploy          # Build and deploy to Cloudflare
npm run tail            # Stream Cloudflare Worker logs
npx wrangler secret put STRAVA_CLIENT_ID     # Set production secret
npx wrangler secret put STRAVA_CLIENT_SECRET # Set production secret

# Maintenance
npm run clean           # Remove dist/ and .wrangler/
```

## Architecture

### Core Application Flow
**Entry Point:** `src/main.js` initializes all components and sets up global handlers

**Data Pipeline:**
1. GPX Parser (`src/data/gpx-parser.js`) - Parses GPX files, extracts GPS points with elevation/timing, calculates statistics
2. Route Storage (`src/data/route-storage.js`) - Local storage persistence with downsampling
3. Route Aggregation (`src/ui/file-upload.js`) - Sophisticated aggregation algorithms (3 modes × 2 elevation modes)
4. Visualization - Either 3D (Three.js) or 2D (Leaflet) rendering

### Key Classes

**`FileUploadHandler` (`src/ui/file-upload.js`)** - Main orchestrator
- Handles file uploads, drag & drop, route storage
- Contains route aggregation algorithms (distance/time/fictional modes)
- Manages UI state and visualization switching
- Global: `window.fileUploader`

**`GPXParser` (`src/data/gpx-parser.js`)** - Data processing foundation
- Parses GPX XML and extracts waypoints
- Calculates: distance, elevation gain/loss, duration
- Returns standardized route objects

**`Route3DVisualization` (`src/visualization/route-3d.js`)** - Three.js 3D rendering
**`RouteMapVisualization` (`src/visualization/route-map.js`)** - Leaflet 2D mapping

**`StravaAuth` (`src/auth/strava-auth.js`)** - OAuth client-side flow coordination
- Global: `window.stravaAuth`

### Workers (Cloudflare)

**`workers/strava-api.js`** - Server-side OAuth and Strava API proxy
- Entry point configured in `wrangler.jsonc`
- Handles `/api/*` routes (see `assets.run_worker_first` in wrangler.jsonc)
- Endpoints: `/api/auth/login`, `/api/auth/callback`, `/api/auth/status`, `/api/auth/logout`, `/api/activities/*`
- Uses HTTP-only cookies for secure token storage
- Required secrets: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

## Route Aggregation System (Core Feature)

### Three Aggregation Modes

```javascript
// Distance Mode: End-to-end spatial connection
createDistanceBasedAggregation(routes, elevationMode)

// Time Mode: Temporal aggregation with auto time steps (min/hour/day)
createTimeBasedAggregation(routes, elevationMode)

// Fictional Mode: Synthetic coordinate generation
createFictionalRouteAggregation(routes, elevationMode, pathPattern)
```

### Two Elevation Processing Modes
- **`actual`**: Preserves original elevation values
- **`cumulative`**: Tracks cumulative climbing (positive elevation gain only)

### Fictional Route Patterns
- **Spiral**: Dramatic 10km-height spirals (`generateSpiralPath`)
- **Switchbacks**: Realistic 2km-height mountain paths (`generateSwitchbacksPath`)
  - 120 segments, 2000 max attempts per segment
  - True switchback detection (120°-240° turns)
  - Non-self-intersecting path validation
  - Bézier curve interpolation for organic smoothness

## Data Structures

### Route Object Structure
```javascript
{
  id: string,                    // Unique identifier
  filename: string,              // Original filename
  points: [{                     // GPS waypoints
    lat: number,
    lon: number,
    elevation: number,           // meters
    timestamp: Date              // optional
  }],
  distance: number,              // meters
  elevationGain: number,         // meters
  elevationLoss: number,         // meters
  duration: number,              // milliseconds (optional)
  metadata: {                    // For aggregated routes
    aggregationMode: string,     // 'distance'|'time'|'fictional'
    elevationMode: string,       // 'actual'|'cumulative'
    sourceRoutes: string[],      // Array of source route IDs
    pathPattern: string          // 'spiral'|'switchbacks' (fictional only)
  }
}
```

## Development Patterns

### Console Logging Convention
Emoji-prefixed logs for debugging:
```javascript
console.log('🔗 Aggregating routes...');  // Process start
console.log('✅ Route created');          // Success
console.log('⚠️ Warning message');        // Warnings
console.log('❌ Error occurred');         // Errors
```

### UI State Management
- Global accessibility: `window.fileUploader`, `window.stravaAuth`
- Route selection: `this.selectedRoutes` Set
- Modal-based aggregation UI with radio button options

### GPX Export
Full GPX generation with proper XML escaping for downloaded routes

## Testing

**Framework:** Vitest with jsdom environment

**Coverage exclusions:**
- `workers/` - Cloudflare Workers (requires Workers runtime)
- `src/visualization/**` - Three.js (requires WebGL)
- `src/main.js` - Entry point (integration tested via E2E)

**Test files:** `test/**/*.test.js` or `test/**/*.spec.js`

**Run single test file:**
```bash
npm test test/data/route-storage.test.js
```

## Build & Deployment

### Vite Configuration
- Root: `index.html`
- Multi-page setup: `index.html`, `terms/index.html`, `privacy/index.html`
- Dev server: port 3000, auto-open browser
- Cloudflare plugin for Workers integration

### Wrangler Configuration
- **Input config:** `wrangler.jsonc` (source of truth)
- **Output config:** `dist/wrangler.json` (generated by `vite build`)
- **Custom domains:** routecoin.me, www.routecoin.me
- **CPU limit:** 5000ms per request
- **Compatibility:** nodejs_compat flag enabled

### Environment Variables
**Local development:** `.env` file (Vite loads automatically)
```bash
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
```

**Production:** Cloudflare secrets (see deployment commands above)

## Strava Integration

**OAuth Flow:**
1. User clicks "Connect Strava" → Frontend calls `/api/auth/login`
2. Worker redirects to Strava OAuth page
3. Strava redirects to `/api/auth/callback` with code
4. Worker exchanges code for tokens, sets HTTP-only cookie, redirects to app
5. Frontend uses cookie for authenticated `/api/activities/*` requests

**API Setup:**
- Create app at https://www.strava.com/settings/api
- Set "Authorization Callback Domain" to `localhost` (dev) or your domain (prod)

**Note:** App works without Strava integration - direct GPX upload is always available.

## Common Tasks

### Adding a new aggregation mode
1. Add mode to `createAggregatedRouteWithOptions()` in `src/ui/file-upload.js`
2. Implement aggregation function (follow existing patterns)
3. Add UI radio button to aggregation modal in `setupAggregationModalHandlers()`

### Adding a new visualization
1. Create class in `src/visualization/`
2. Implement `render(route)` and `dispose()` methods
3. Add to visualization switcher in `FileUploadHandler`

### Modifying route storage
1. Update `RouteStorage` class in `src/data/route-storage.js`
2. Handle migration for existing localStorage data
3. Update downsampling logic if needed for size constraints
