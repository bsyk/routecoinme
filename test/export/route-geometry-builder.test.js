/**
 * Tests for Route Geometry Builder
 */

import { describe, it, expect } from 'vitest';
import {
  setupProjection,
  projectPoints,
  calculateBounds,
  scaleAndCenter,
  applyVerticalExaggeration,
  buildRouteGeometry
} from '../../src/export/route-geometry-builder.js';
import { DEFAULT_STL_OPTIONS } from '../../src/export/stl-options.js';

describe('Route Geometry Builder', () => {
  const samplePoints = [
    { lat: 37.7749, lon: -122.4194, elevation: 0 },
    { lat: 37.7849, lon: -122.4094, elevation: 100 },
    { lat: 37.7949, lon: -122.3994, elevation: 200 }
  ];

  describe('setupProjection', () => {
    it('should create mercator projection', () => {
      const projection = setupProjection('mercator', samplePoints);
      expect(projection).toBeDefined();
      expect(typeof projection.forward).toBe('function');
    });

    it('should create UTM projection', () => {
      const projection = setupProjection('utm', samplePoints);
      expect(projection).toBeDefined();
      expect(typeof projection.forward).toBe('function');
    });

    it('should throw error for invalid projection type', () => {
      expect(() => setupProjection('invalid', samplePoints)).toThrow();
    });
  });

  describe('projectPoints', () => {
    it('should project lat/lon to x/y coordinates', () => {
      const projection = setupProjection('mercator', samplePoints);
      const projected = projectPoints(samplePoints, projection);

      expect(projected).toHaveLength(3);
      projected.forEach(point => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(point).toHaveProperty('z');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
        expect(typeof point.z).toBe('number');
      });
    });

    it('should preserve elevation as z coordinate', () => {
      const projection = setupProjection('mercator', samplePoints);
      const projected = projectPoints(samplePoints, projection);

      expect(projected[0].z).toBe(0);
      expect(projected[1].z).toBe(100);
      expect(projected[2].z).toBe(200);
    });

    it('should handle missing elevation', () => {
      const noElevation = [
        { lat: 37.7749, lon: -122.4194 },
        { lat: 37.7849, lon: -122.4094 }
      ];
      const projection = setupProjection('mercator', noElevation);
      const projected = projectPoints(noElevation, projection);

      projected.forEach(point => {
        expect(point.z).toBe(0);
      });
    });
  });

  describe('calculateBounds', () => {
    it('should calculate correct bounds', () => {
      const points = [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 50, z: 200 },
        { x: -50, y: 75, z: 100 }
      ];

      const bounds = calculateBounds(points);

      expect(bounds.minX).toBe(-50);
      expect(bounds.maxX).toBe(100);
      expect(bounds.minY).toBe(0);
      expect(bounds.maxY).toBe(75);
      expect(bounds.minZ).toBe(0);
      expect(bounds.maxZ).toBe(200);
    });
  });

  describe('scaleAndCenter', () => {
    it('should scale points to fit print bed', () => {
      const projection = setupProjection('mercator', samplePoints);
      const projected = projectPoints(samplePoints, projection);
      const result = scaleAndCenter(projected, DEFAULT_STL_OPTIONS);
      const scaled = result.points;

      const bounds = calculateBounds(scaled);
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxY - bounds.minY;

      // Should fit within bed dimensions (with margins)
      expect(width).toBeLessThanOrEqual(DEFAULT_STL_OPTIONS.bedx);
      expect(depth).toBeLessThanOrEqual(DEFAULT_STL_OPTIONS.bedy);
    });

    it('should center points around origin', () => {
      const projection = setupProjection('mercator', samplePoints);
      const projected = projectPoints(samplePoints, projection);
      const result = scaleAndCenter(projected, DEFAULT_STL_OPTIONS);
      const scaled = result.points;

      const bounds = calculateBounds(scaled);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      // Should be approximately centered (within 1mm)
      expect(Math.abs(centerX)).toBeLessThan(1);
      expect(Math.abs(centerY)).toBeLessThan(1);
    });
  });

  describe('applyVerticalExaggeration', () => {
    it('should scale to target height when targetHeight is set', () => {
      const points = [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 10, z: 100 },
        { x: 20, y: 20, z: 200 }
      ];

      const options = { ...DEFAULT_STL_OPTIONS, targetHeight: 50, zcut: true };
      const exaggerated = applyVerticalExaggeration(points, options);

      // With zcut=true, min elevation becomes 0
      // Range is 200, target is 50, so scale is 50/200 = 0.25
      // minPathHeight (1mm) is added as floor offset
      expect(exaggerated[0].z).toBe(1);       // (0 - 0) * 0.25 + 1
      expect(exaggerated[1].z).toBe(26);      // (100 - 0) * 0.25 + 1
      expect(exaggerated[2].z).toBe(51);      // (200 - 0) * 0.25 + 1

      // x and y should be unchanged
      expect(exaggerated[0].x).toBe(0);
      expect(exaggerated[1].x).toBe(10);
    });

    it('should use vertical multiplier when targetHeight is 0', () => {
      const points = [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 10, z: 100 },
        { x: 20, y: 20, z: 200 }
      ];

      const options = { ...DEFAULT_STL_OPTIONS, targetHeight: 0, vertical: 3, zcut: true };
      const exaggerated = applyVerticalExaggeration(points, options);

      // With targetHeight=0, use vertical multiplier
      // minPathHeight (1mm) is added as floor offset
      expect(exaggerated[0].z).toBe(1);   // (0 - 0) * 3 + 1
      expect(exaggerated[1].z).toBe(301); // (100 - 0) * 3 + 1
      expect(exaggerated[2].z).toBe(601); // (200 - 0) * 3 + 1
    });

    it('should respect zcut=false option', () => {
      const points = [
        { x: 0, y: 0, z: 100 },
        { x: 10, y: 10, z: 200 }
      ];

      const options = { ...DEFAULT_STL_OPTIONS, targetHeight: 0, vertical: 2, zcut: false };
      const exaggerated = applyVerticalExaggeration(points, options);

      // With zcut=false, absolute elevation is used
      // minPathHeight (1mm) is added as floor offset
      expect(exaggerated[0].z).toBe(201); // 100 * 2 + 1
      expect(exaggerated[1].z).toBe(401); // 200 * 2 + 1
    });
  });

  describe('buildRouteGeometry', () => {
    it('should build complete geometry from route', () => {
      const route = {
        id: 'test-route',
        filename: 'test.gpx',
        points: samplePoints
      };

      const geometry = buildRouteGeometry(route, DEFAULT_STL_OPTIONS);

      expect(geometry).toBeDefined();
      expect(geometry.attributes.position).toBeDefined();
      expect(geometry.attributes.normal).toBeDefined();
      expect(geometry.attributes.position.count).toBeGreaterThan(0);

      // Clean up
      geometry.dispose();
    });

    it('should handle routes with many points', () => {
      const manyPoints = [];
      for (let i = 0; i < 100; i++) {
        manyPoints.push({
          lat: 37.7749 + (i * 0.001),
          lon: -122.4194 + (i * 0.001),
          elevation: i * 10
        });
      }

      const route = {
        id: 'long-route',
        points: manyPoints
      };

      const geometry = buildRouteGeometry(route, DEFAULT_STL_OPTIONS);

      expect(geometry.attributes.position.count).toBeGreaterThan(100);

      // Clean up
      geometry.dispose();
    });
  });
});
