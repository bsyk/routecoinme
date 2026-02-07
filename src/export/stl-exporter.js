/**
 * STL Exporter
 *
 * Main API for exporting routes as 3D-printable STL files.
 * Uses Three.js STLExporter addon for binary STL generation.
 */

import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { buildRouteGeometry } from './route-geometry-builder.js';
import { DEFAULT_STL_OPTIONS } from './stl-options.js';

/**
 * Export a route to STL format
 * @param {Object} route - Route object with points array
 * @param {Object} options - STL export options (merged with defaults)
 * @returns {Blob} STL file as binary blob
 */
export async function exportToSTL(route, options = {}) {
  console.log('🖨️ Starting STL export for route:', route.filename || route.id);

  // Validate route has points
  if (!route.points || route.points.length < 2) {
    throw new Error('Route must have at least 2 points for STL export');
  }

  // Merge options with defaults
  const finalOptions = {
    ...DEFAULT_STL_OPTIONS,
    ...options
  };

  // Note: Elevation scaling is now handled by targetHeight in route-geometry-builder
  // No need for manual adjustments here

  try {
    // Build 3D geometry
    const geometry = buildRouteGeometry(route, finalOptions);

    // Log geometry info for debugging
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;

    console.log(`  📊 Geometry info:`);
    console.log(`     - Positions: ${positions.count} vertices`);
    console.log(`     - Normals: ${normals ? normals.count : 'MISSING'} normals`);

    if (positions.count > 0) {
      // Sample first vertex
      const x = positions.getX(0);
      const y = positions.getY(0);
      const z = positions.getZ(0);
      console.log(`     - First vertex: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
    }

    // Validate geometry
    if (!normals || normals.count !== positions.count) {
      console.error(`  ❌ Geometry validation failed: normals mismatch`);
      throw new Error('Invalid geometry: normals missing or count mismatch');
    }

    // Wrap geometry in a mesh (STLExporter needs a mesh or scene)
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    // Export to STL (binary format)
    const exporter = new STLExporter();
    const stlData = exporter.parse(mesh, { binary: true });

    // Convert ArrayBuffer to Blob
    const blob = new Blob([stlData], { type: 'application/octet-stream' });

    console.log(`✅ STL export complete (${(blob.size / 1024).toFixed(1)} KB, ${stlData.byteLength} bytes)`);

    // Clean up
    geometry.dispose();
    material.dispose();

    return blob;
  } catch (error) {
    console.error('❌ STL export failed:', error);
    throw error;
  }
}

/**
 * Generate a sensible filename for STL export
 * @param {Object} route - Route object
 * @param {Object} options - STL export options
 * @returns {string} Sanitized filename
 */
export function generateFilename(route, options = {}) {
  let baseName = '';

  // Use route filename or ID
  if (route.filename) {
    baseName = route.filename.replace(/\.gpx$/i, '');
  } else if (route.id) {
    baseName = route.id;
  } else {
    baseName = 'route';
  }

  // Add metadata if available
  if (route.metadata) {
    if (route.metadata.aggregationMode) {
      baseName += `_${route.metadata.aggregationMode}`;
    }
    if (route.metadata.elevationMode === 'cumulative') {
      baseName += '_cumulative';
    }
    if (route.metadata.pathPattern) {
      baseName += `_${route.metadata.pathPattern}`;
    }
  }

  // Add options suffix if non-default
  if (options.vertical && options.vertical !== DEFAULT_STL_OPTIONS.vertical) {
    baseName += `_${options.vertical}x`;
  }

  // Add base diameter if non-default
  if (options.baseDiameter && options.baseDiameter !== DEFAULT_STL_OPTIONS.baseDiameter) {
    baseName += `_${options.baseDiameter / 10}cm`;
  }

  // Add note if base is omitted
  if (options.base === 0) {
    baseName += '_no-base';
  }

  // Sanitize filename (remove special characters)
  baseName = baseName
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `${baseName}.stl`;
}

/**
 * Export route and trigger download
 * @param {Object} route - Route object
 * @param {Object} options - STL export options
 * @returns {Promise<void>}
 */
export async function exportAndDownload(route, options = {}) {
  const blob = await exportToSTL(route, options);
  const filename = generateFilename(route, options);

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // Clean up
  URL.revokeObjectURL(url);

  console.log(`🎉 Downloaded: ${filename}`);
}
