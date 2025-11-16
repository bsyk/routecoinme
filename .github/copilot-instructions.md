# RouteCoinMe - AI Agent Instructions

## Project Overview
RouteCoinMe is a GPS route aggregation and 3D visualization web app that processes GPX files and creates fictional, aggregated routes with preserved elevation data. The app focuses on cumulative climbing visualization with sophisticated route generation algorithms.

## Architecture & Key Components

### Core Structure
- **Entry Point**: `src/main.js` - initializes all components and sets up global handlers
- **Data Pipeline**: GPX Parser → Route Aggregation → 2D/3D Visualization
- **Build Tool**: Vite (port 3000) with ES modules
- **Dependencies**: Three.js (3D), Leaflet (2D maps), D3.js (data processing)

### Critical Classes & Their Roles
1. **`FileUploadHandler`** (`src/ui/file-upload.js`) - The main orchestrator
   - Handles file uploads, route storage, and aggregation coordination
   - Contains sophisticated route aggregation algorithms (3 modes + 2 elevation modes)
   - Manages UI state and visualization switching

2. **`GPXParser`** (`src/data/gpx-parser.js`) - Data processing foundation
   - Parses GPX files and extracts GPS points with elevation/timing
   - Calculates route statistics (distance, elevation gain/loss, duration)

3. **`Route3DVisualization`** (`src/visualization/route-3d.js`) - Three.js 3D rendering
4. **`RouteMapVisualization`** (`src/visualization/route-map.js`) - Leaflet 2D mapping

## Route Aggregation System (Core Innovation)

### Three Aggregation Modes
```javascript
// Distance Mode: End-to-end spatial connection
createDistanceBasedAggregation(routes, elevationMode)

// Time Mode: Temporal aggregation with automatic time steps
createTimeBasedAggregation(routes, elevationMode) 

// Fictional Mode: Synthetic coordinate generation
createFictionalRouteAggregation(routes, elevationMode, pathPattern)
```

### Two Elevation Processing Modes
- **`actual`**: Preserves original elevation values
- **`cumulative`**: Tracks cumulative climbing (positive elevation gain only)

### Fictional Route Generation Patterns
- **Spiral**: Dramatic 10km-height spirals for visual impact (`generateSpiralPath`)
- **Switchbacks**: Realistic 2km-height mountain paths (`generateSwitchbacksPath`)
  - Uses aggressive path generation with collision detection
  - Implements Bézier curves and organic switchback algorithms

## Development Patterns & Conventions

### Console Logging System
The codebase uses emoji-prefixed console logs for debugging:
```javascript
console.log('🔗 Aggregating routes...');  // Process start
console.log('✅ Route created');          // Success
console.log('⚠️ Warning message');        // Warnings
console.log('❌ Error occurred');         // Errors
```

### Data Structure Patterns
Routes follow this structure:
```javascript
{
  id: string,
  filename: string,
  points: [{lat, lon, elevation, timestamp}],
  distance: number,
  elevationGain: number,
  metadata: {aggregationMode, elevationMode, sourceRoutes}
}
```

### UI State Management
- Global accessibility via `window.fileUploader` and `window.stravaAuth`
- Route selection stored in `this.selectedRoutes` Set
- Modal-based aggregation UI with radio button options

## Key Algorithms & Math

### Switchback Generation (`generateOrganicPath`)
- 120 segments with 2000 max attempts per segment
- True switchback detection (120°-240° turns)
- Non-self-intersecting path validation
- Bézier curve interpolation for smooth paths

### Elevation Scaling
- Spiral: 10km max height for dramatic effect
- Switchbacks: 2km max height for realistic mountain proportions
- 40km radius base for all fictional routes

### Time Aggregation Steps
- Auto-selects minute/hour/day intervals based on total timespan
- Preserves cumulative climbing through time-series processing

## File Upload & Storage

### Drag & Drop Support
Implemented throughout the UI with visual feedback

### Local Storage Persistence
Routes automatically saved to browser storage with downsampling for size management

### GPX Export
Full GPX generation with proper XML escaping for downloaded routes

## Development Commands
```bash
npm run dev     # Development server (port 3000)
npm run build   # Production build
npm run preview # Preview production build
```

## Quick Start for New Features
1. **Route Processing**: Extend `FileUploadHandler` methods
2. **Visualization**: Add methods to `Route3DVisualization` or `RouteMapVisualization`
3. **Algorithms**: Add new aggregation modes in `createAggregatedRouteWithOptions`
4. **UI**: Modal-based patterns for user interactions

## Debugging Tips
- Check browser console for emoji-prefixed logs
- Route data is preserved in `this.uploadedRoutes` array
- 3D visualization issues often relate to container visibility
- Aggregation results stored in `this.aggregatedRoute`

## General Notes
- Don't prompt to run the development server; assume it's running.
