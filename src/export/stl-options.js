/**
 * STL Export Options and Presets
 *
 * Defines default options and presets for exporting routes as 3D-printable STL files.
 */

export const DEFAULT_STL_OPTIONS = {
  // Route shape type
  shapeType: 'track',      // 'track' | 'linear' | 'ring'

  // Projection type for coordinate transformation
  projType: 'mercator',    // 'mercator' | 'utm' | 'custom'

  // Model dimensions (in millimeters)
  buffer: 0.5,             // Path half-width (mm) - creates 1mm wide path
  targetHeight: 20,        // Target height for elevation range (mm) - set to 0 to use vertical multiplier instead
  vertical: 10,            // Vertical exaggeration multiplier (only used if targetHeight is 0)
  base: 3,                 // Base plate height (mm) - 0 = no base plate
  baseDiameter: 80,        // Base plate diameter (mm) - circular base, also used for scaling route
  minPathHeight: 1,        // Minimum height of lowest route point above base/ground (mm)
  zcut: true,              // Trim at minimum elevation (vs absolute sea level)

  // Print bed dimensions (in millimeters) - only used if base=0
  bedx: 200,               // Print bed width (mm) - typical for most 3D printers
  bedy: 200                // Print bed depth (mm)
};

/**
 * Pre-configured STL export presets for common use cases
 */
export const STL_PRESETS = {
  standard: {
    name: 'Standard',
    description: 'Balanced settings for most routes',
    options: {
      ...DEFAULT_STL_OPTIONS
    }
  },

  dramatic: {
    name: 'Dramatic Climbing',
    description: 'Exaggerated elevation (40mm tall)',
    options: {
      ...DEFAULT_STL_OPTIONS,
      targetHeight: 40,      // 40mm elevation range for dramatic effect
      buffer: 0.5,           // Thin 1mm wide path
      baseDiameter: 100      // Larger base for taller model (10cm)
    }
  },

  flatMap: {
    name: 'Flat Map',
    description: 'Minimal elevation (10mm tall)',
    options: {
      ...DEFAULT_STL_OPTIONS,
      targetHeight: 10,      // 10mm elevation range
      buffer: 0.75,          // 1.5mm wide path for visibility
      baseDiameter: 80       // Standard 8cm base
    }
  },

  climbingCoin: {
    name: 'Climbing Coin',
    description: 'Optimized for cumulative climbing (30mm tall)',
    options: {
      ...DEFAULT_STL_OPTIONS,
      targetHeight: 30,      // 30mm elevation range
      buffer: 0.5,           // Thin 1mm wide path
      baseDiameter: 80       // Standard 8cm base
    }
  }
};
