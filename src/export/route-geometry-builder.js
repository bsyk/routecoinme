/**
 * Route Geometry Builder
 *
 * Transforms GPS routes into 3D geometry suitable for STL export.
 * Handles coordinate projection, scaling, and Three.js mesh generation.
 */

import * as THREE from 'three';
import proj4 from 'proj4';

/**
 * Setup projection for coordinate transformation
 * @param {string} projType - Projection type ('mercator' | 'utm')
 * @param {Array} points - Array of {lat, lon, elevation} points
 * @returns {Function} Projection function
 */
export function setupProjection(projType, points) {
  if (projType === 'mercator') {
    // Web Mercator projection (EPSG:3857)
    proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');
    return proj4('EPSG:4326', 'EPSG:3857');
  } else if (projType === 'utm') {
    // Auto-detect UTM zone from first point
    const lon = points[0].lon;
    const lat = points[0].lat;
    const zone = Math.floor((lon + 180) / 6) + 1;
    const hemisphere = lat >= 0 ? '+north' : '+south';
    const utmProj = `+proj=utm +zone=${zone} ${hemisphere} +datum=WGS84 +units=m +no_defs`;
    proj4.defs('AUTO_UTM', utmProj);
    return proj4('EPSG:4326', 'AUTO_UTM');
  }

  throw new Error(`Unsupported projection type: ${projType}`);
}

/**
 * Project points from WGS84 (lat/lon) to projected coordinates
 * @param {Array} points - Array of {lat, lon, elevation} points
 * @param {Function} projection - proj4 projection function
 * @returns {Array} Array of {x, y, z} projected points
 */
export function projectPoints(points, projection) {
  return points.map(point => {
    const [x, y] = projection.forward([point.lon, point.lat]);
    return {
      x,
      y,
      z: point.elevation || 0
    };
  });
}

/**
 * Calculate bounds of projected points
 * @param {Array} points - Array of {x, y, z} points
 * @returns {Object} Bounds {minX, maxX, minY, maxY, minZ, maxZ}
 */
export function calculateBounds(points) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  for (const point of points) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  }

  return bounds;
}

/**
 * Scale and center points to fit within print bed or circular base
 * @param {Array} points - Array of {x, y, z} projected points (in meters)
 * @param {Object} options - STL export options
 * @returns {Object} Scaled points and scale factor
 */
export function scaleAndCenter(points, options) {
  const bounds = calculateBounds(points);

  // Calculate dimensions in meters
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;

  let availableSize;
  let targetDescription;

  if (options.base > 0 && options.baseDiameter) {
    // Scale to fit within circular base
    // Leave margin for wall thickness and some clearance
    const margin = options.buffer * 4; // Wall thickness * 4 for safety
    const radius = options.baseDiameter / 2;
    availableSize = (radius - margin) * 2; // Diameter minus margins
    targetDescription = `${options.baseDiameter}mm circular base`;
  } else {
    // Scale to fit within rectangular print bed
    const margin = 10; // 10mm margins
    const availableWidth = options.bedx - (2 * margin);
    const availableDepth = options.bedy - (2 * margin);
    availableSize = Math.min(availableWidth, availableDepth);
    targetDescription = `${options.bedx}x${options.bedy}mm print bed`;
  }

  // Calculate the maximum dimension of the route
  const maxDimension = Math.max(width, depth); // in meters

  // Convert meters to millimeters and scale to fit
  const scale = availableSize / (maxDimension * 1000);

  // Calculate center offsets (in meters)
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Transform points - apply same scale to all axes to maintain proportions
  const scaledPoints = points.map(point => ({
    x: (point.x - centerX) * 1000 * scale, // convert m to mm, then scale
    y: (point.y - centerY) * 1000 * scale,
    z: point.z * 1000 * scale // convert elevation from m to mm and scale proportionally
  }));

  console.log(`  📏 Scaled to fit ${targetDescription} (${availableSize.toFixed(1)}mm available)`);

  return { points: scaledPoints, scale };
}

/**
 * Apply vertical exaggeration to elevation data
 * @param {Array} points - Array of {x, y, z} points (already in mm)
 * @param {Object} options - STL export options
 * @returns {Array} Points with exaggerated elevation
 */
export function applyVerticalExaggeration(points, options) {
  const bounds = calculateBounds(points);
  const minZ = options.zcut ? bounds.minZ : 0;
  const maxZ = bounds.maxZ;

  // Calculate current elevation range
  const currentRange = maxZ - minZ;

  let verticalScale;

  if (options.targetHeight && options.targetHeight > 0) {
    // Calculate scale needed to achieve target height
    if (currentRange > 0) {
      verticalScale = options.targetHeight / currentRange;
      console.log(`  📏 Auto-scaling elevation: ${currentRange.toFixed(2)}mm range → ${options.targetHeight}mm (${verticalScale.toFixed(1)}x multiplier)`);
    } else {
      // Flat route - use a default multiplier
      verticalScale = 1;
      console.log(`  ⚠️ Flat route (no elevation change), using 1x multiplier`);
    }
  } else {
    // Use fixed vertical exaggeration multiplier
    verticalScale = options.vertical;
    const finalRange = currentRange * verticalScale;
    console.log(`  📏 Fixed vertical exaggeration: ${options.vertical}x (${currentRange.toFixed(2)}mm → ${finalRange.toFixed(2)}mm)`);
  }

  return points.map(point => ({
    x: point.x,
    y: point.y,
    z: (point.z - minZ) * verticalScale
  }));
}

/**
 * Simplify points by removing consecutive points that are too close
 * @param {Array} points - Array of {x, y, z} points
 * @param {number} minDistance - Minimum distance between consecutive points (mm)
 * @returns {Array} Simplified points
 */
function simplifyPoints(points, minDistance = 0.5) {
  if (points.length < 2) return points;

  const simplified = [points[0]]; // Always keep first point

  for (let i = 1; i < points.length; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = points[i];

    // Calculate distance
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = curr.z - prev.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Only keep point if it's far enough from previous
    if (dist >= minDistance) {
      simplified.push(curr);
    }
  }

  // Always keep last point if it's not already there
  if (simplified[simplified.length - 1] !== points[points.length - 1]) {
    simplified.push(points[points.length - 1]);
  }

  return simplified;
}

/**
 * Generate wall/ribbon geometry - vertical wall from ground to elevation
 * Creates a continuous mesh by connecting all points properly
 * @param {Array} points - Array of {x, y, z} points
 * @param {Object} options - STL export options
 * @returns {THREE.BufferGeometry} Wall geometry
 */
function generateWallGeometry(points, options) {
  const wallThickness = options.buffer || 2; // Thickness of the wall in mm
  const halfThickness = wallThickness / 2;

  const positions = [];
  const indices = [];

  // Create a continuous ribbon/wall
  // For each point, create 4 vertices: left-bottom, right-bottom, left-top, right-top
  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    // Calculate perpendicular direction for this point
    let perpX, perpY;

    if (i === 0) {
      // First point: use direction to next point
      const dx = points[i + 1].x - p.x;
      const dy = points[i + 1].y - p.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      perpX = -dy / length;
      perpY = dx / length;
    } else if (i === points.length - 1) {
      // Last point: use direction from previous point
      const dx = p.x - points[i - 1].x;
      const dy = p.y - points[i - 1].y;
      const length = Math.sqrt(dx * dx + dy * dy);
      perpX = -dy / length;
      perpY = dx / length;
    } else {
      // Middle point: average of directions to/from adjacent points
      const dx1 = p.x - points[i - 1].x;
      const dy1 = p.y - points[i - 1].y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = points[i + 1].x - p.x;
      const dy2 = points[i + 1].y - p.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      // Average perpendicular direction
      const perp1X = -dy1 / len1;
      const perp1Y = dx1 / len1;
      const perp2X = -dy2 / len2;
      const perp2Y = dx2 / len2;

      perpX = (perp1X + perp2X) / 2;
      perpY = (perp1Y + perp2Y) / 2;

      // Normalize
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
      perpX /= perpLen;
      perpY /= perpLen;
    }

    // Create 4 vertices for this point
    // Bottom left
    positions.push(p.x + perpX * halfThickness, p.y + perpY * halfThickness, 0);
    // Bottom right
    positions.push(p.x - perpX * halfThickness, p.y - perpY * halfThickness, 0);
    // Top left
    positions.push(p.x + perpX * halfThickness, p.y + perpY * halfThickness, p.z);
    // Top right
    positions.push(p.x - perpX * halfThickness, p.y - perpY * halfThickness, p.z);
  }

  // Create faces connecting consecutive points
  for (let i = 0; i < points.length - 1; i++) {
    const baseIdx = i * 4;
    const nextIdx = (i + 1) * 4;

    // Bottom face (connects bottom left and right between points)
    indices.push(baseIdx + 0, nextIdx + 0, baseIdx + 1);
    indices.push(baseIdx + 1, nextIdx + 0, nextIdx + 1);

    // Top face (connects top left and right between points)
    indices.push(baseIdx + 2, baseIdx + 3, nextIdx + 2);
    indices.push(baseIdx + 3, nextIdx + 3, nextIdx + 2);

    // Left face (front side of wall)
    indices.push(baseIdx + 0, baseIdx + 2, nextIdx + 0);
    indices.push(nextIdx + 0, baseIdx + 2, nextIdx + 2);

    // Right face (back side of wall)
    indices.push(baseIdx + 1, nextIdx + 1, baseIdx + 3);
    indices.push(nextIdx + 1, nextIdx + 3, baseIdx + 3);
  }

  // Add end caps to close the mesh
  // First point cap
  indices.push(0, 2, 1);
  indices.push(1, 2, 3);

  // Last point cap
  const lastIdx = (points.length - 1) * 4;
  indices.push(lastIdx + 0, lastIdx + 1, lastIdx + 2);
  indices.push(lastIdx + 1, lastIdx + 3, lastIdx + 2);

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Generate 3D path geometry using wall/ribbon visualization
 * @param {Array} points - Array of {x, y, z} points
 * @param {Object} options - STL export options
 * @returns {THREE.BufferGeometry} Combined geometry with path and base
 */
export function generatePathGeometry(points, options) {
  console.log(`  🔧 Generating geometry from ${points.length} points`);

  // Simplify points to remove consecutive points that are too close
  // This prevents degenerate triangles in the tube geometry
  const minDistance = 0.5; // 0.5mm minimum spacing
  const simplifiedPoints = simplifyPoints(points, minDistance);

  if (simplifiedPoints.length !== points.length) {
    console.log(`  🔽 Simplified ${points.length} points → ${simplifiedPoints.length} points (removed ${points.length - simplifiedPoints.length} too-close points)`);
  }

  // Use simplified points for geometry
  points = simplifiedPoints;

  console.log(`  📐 First point: (${points[0].x.toFixed(2)}, ${points[0].y.toFixed(2)}, ${points[0].z.toFixed(2)})`);
  console.log(`  📐 Last point: (${points[points.length-1].x.toFixed(2)}, ${points[points.length-1].y.toFixed(2)}, ${points[points.length-1].z.toFixed(2)})`);

  // Calculate route dimensions
  const bounds = calculateBounds(points);
  const routeWidth = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const routeHeight = bounds.maxZ - bounds.minZ;

  console.log(`  🧱 Creating wall/ribbon geometry (route: ${routeWidth.toFixed(2)}mm wide × ${routeHeight.toFixed(2)}mm tall)`);

  // Generate wall geometry - vertical wall from ground to elevation
  const wallGeometry = generateWallGeometry(points, options);

  console.log(`  ✓ Wall created: ${wallGeometry.attributes.position.count} vertices`);

  let finalGeometry;

  // Generate base plate if requested
  if (options.base > 0) {
    const baseGeometry = generateBasePlate(points, options);
    console.log(`  ✓ Base created: ${baseGeometry.attributes.position.count} vertices`);

    // Merge geometries
    const geometries = [wallGeometry, baseGeometry];
    finalGeometry = mergeGeometries(geometries);

    console.log(`  ✓ Merged geometry: ${finalGeometry.attributes.position.count} vertices`);
  } else {
    console.log(`  ⊘ No base plate (base=0)`);
    finalGeometry = wallGeometry;
  }

  // Translate geometry to positive coordinates for better viewer compatibility
  // Find minimum coordinates
  const finalBounds = calculateBounds(points);
  const translateX = -finalBounds.minX;
  const translateY = -finalBounds.minY;

  if (translateX !== 0 || translateY !== 0) {
    finalGeometry.translate(translateX, translateY, 0);
    console.log(`  📐 Translated to positive coords: +${translateX.toFixed(2)}mm X, +${translateY.toFixed(2)}mm Y`);
  }

  // Validate geometry
  const posCount = finalGeometry.attributes.position.count;
  const normCount = finalGeometry.attributes.normal.count;
  console.log(`  ✅ Final validation: ${posCount} vertices, ${normCount} normals`);

  if (posCount !== normCount) {
    console.warn(`  ⚠️ Warning: Position count (${posCount}) !== Normal count (${normCount})`);
  }

  return finalGeometry;
}

/**
 * Generate circular base plate geometry
 * @param {Array} points - Array of {x, y, z} points (already exaggerated)
 * @param {Object} options - STL export options
 * @returns {THREE.BufferGeometry} Circular base plate geometry
 */
function generateBasePlate(points, options) {
  const bounds = calculateBounds(points);

  console.log(`  📦 Route bounds: X[${bounds.minX.toFixed(2)} to ${bounds.maxX.toFixed(2)}], Y[${bounds.minY.toFixed(2)} to ${bounds.maxY.toFixed(2)}], Z[${bounds.minZ.toFixed(2)} to ${bounds.maxZ.toFixed(2)}]`);

  // Create circular base plate
  const diameter = options.baseDiameter || 50; // Default 50mm diameter
  const radius = diameter / 2;
  const height = options.base;

  console.log(`  🔵 Circular base plate: ${diameter.toFixed(2)}mm diameter × ${height.toFixed(2)}mm height`);

  // Create cylinder geometry (positioned at origin initially)
  const radialSegments = 32; // Smooth circle
  const baseGeometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);

  // Rotate cylinder to align with our coordinate system
  // CylinderGeometry is oriented along Y axis, we need it along Z axis
  baseGeometry.rotateX(Math.PI / 2);

  // Position base so its TOP surface is at z=0 (where the wall starts)
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const baseZ = -height / 2; // Center base so top is at z=0

  console.log(`  🔵 Base positioned at: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${baseZ.toFixed(2)}), top surface at Z=0.00`);

  baseGeometry.translate(centerX, centerY, baseZ);

  return baseGeometry;
}

/**
 * Merge multiple geometries into a single geometry
 * @param {Array<THREE.BufferGeometry>} geometries - Array of geometries to merge
 * @returns {THREE.BufferGeometry} Merged geometry
 */
function mergeGeometries(geometries) {
  // Convert to non-indexed geometries for easier merging
  const nonIndexedGeometries = geometries.map(g => g.toNonIndexed());

  // Calculate total vertex count
  let totalVertices = 0;
  for (const geometry of nonIndexedGeometries) {
    totalVertices += geometry.attributes.position.count;
  }

  // Create arrays for merged data
  const positions = new Float32Array(totalVertices * 3);

  // Merge geometries
  let offset = 0;
  for (const geometry of nonIndexedGeometries) {
    const positionAttr = geometry.attributes.position;
    positions.set(positionAttr.array, offset * 3);
    offset += positionAttr.count;
  }

  // Create merged geometry
  const mergedGeometry = new THREE.BufferGeometry();
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Recompute normals to ensure they're correct
  mergedGeometry.computeVertexNormals();

  return mergedGeometry;
}

/**
 * Build complete 3D geometry from route
 * @param {Object} route - Route object with points array
 * @param {Object} options - STL export options
 * @returns {THREE.BufferGeometry} Complete 3D geometry ready for STL export
 */
export function buildRouteGeometry(route, options) {
  console.log('🔨 Building 3D geometry for route:', route.filename || route.id);

  // Step 1: Setup projection
  const projection = setupProjection(options.projType, route.points);

  // Step 2: Project points (results in meters)
  let points = projectPoints(route.points, projection);
  console.log(`  📍 Projected ${points.length} points`);

  // Step 3: Scale and center (convert to mm and scale to fit base or print bed)
  const scaleResult = scaleAndCenter(points, options);
  points = scaleResult.points;

  // Step 4: Apply vertical exaggeration (logging happens inside the function)
  points = applyVerticalExaggeration(points, options);

  // Step 5: Generate geometry
  const geometry = generatePathGeometry(points, options);
  console.log(`  ✅ Generated geometry with ${geometry.attributes.position.count} vertices`);

  return geometry;
}
