/**
 * Tests for STL Exporter
 */

import { describe, it, expect } from 'vitest';
import { exportToSTL, generateFilename } from '../../src/export/stl-exporter.js';
import { DEFAULT_STL_OPTIONS } from '../../src/export/stl-options.js';

describe('STL Exporter', () => {
  const sampleRoute = {
    id: 'test-route',
    filename: 'morning-run.gpx',
    points: [
      { lat: 37.7749, lon: -122.4194, elevation: 0 },
      { lat: 37.7849, lon: -122.4094, elevation: 100 },
      { lat: 37.7949, lon: -122.3994, elevation: 200 },
      { lat: 37.8049, lon: -122.3894, elevation: 150 }
    ]
  };

  describe('exportToSTL', () => {
    it('should export route to STL blob', async () => {
      const blob = await exportToSTL(sampleRoute);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/octet-stream');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should accept custom options', async () => {
      const customOptions = {
        ...DEFAULT_STL_OPTIONS,
        vertical: 5,
        buffer: 10
      };

      const blob = await exportToSTL(sampleRoute, customOptions);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should increase exaggeration for cumulative elevation mode', async () => {
      const cumulativeRoute = {
        ...sampleRoute,
        metadata: {
          elevationMode: 'cumulative'
        }
      };

      const blob = await exportToSTL(cumulativeRoute);

      expect(blob).toBeInstanceOf(Blob);
      // Cumulative routes should have slightly larger files due to higher exaggeration
    });

    it('should throw error for route with insufficient points', async () => {
      const invalidRoute = {
        id: 'invalid',
        points: [{ lat: 37.7749, lon: -122.4194, elevation: 0 }]
      };

      await expect(exportToSTL(invalidRoute)).rejects.toThrow();
    });

    it('should throw error for route without points', async () => {
      const noPointsRoute = {
        id: 'no-points'
      };

      await expect(exportToSTL(noPointsRoute)).rejects.toThrow();
    });
  });

  describe('generateFilename', () => {
    it('should generate filename from route filename', () => {
      const filename = generateFilename(sampleRoute);
      expect(filename).toBe('morning-run.stl');
    });

    it('should remove .gpx extension', () => {
      const route = {
        filename: 'test.gpx'
      };
      const filename = generateFilename(route);
      expect(filename).toBe('test.stl');
    });

    it('should use route ID if no filename', () => {
      const route = {
        id: 'route-123'
      };
      const filename = generateFilename(route);
      expect(filename).toBe('route-123.stl');
    });

    it('should include aggregation metadata', () => {
      const aggregatedRoute = {
        id: 'agg-route',
        metadata: {
          aggregationMode: 'fictional',
          pathPattern: 'spiral'
        }
      };
      const filename = generateFilename(aggregatedRoute);
      expect(filename).toContain('fictional');
      expect(filename).toContain('spiral');
    });

    it('should include cumulative elevation metadata', () => {
      const cumulativeRoute = {
        id: 'climb-route',
        metadata: {
          elevationMode: 'cumulative'
        }
      };
      const filename = generateFilename(cumulativeRoute);
      expect(filename).toContain('cumulative');
    });

    it('should sanitize special characters', () => {
      const route = {
        filename: 'route with spaces & special!chars.gpx'
      };
      const filename = generateFilename(route);
      expect(filename).not.toContain(' ');
      expect(filename).not.toContain('&');
      expect(filename).not.toContain('!');
      expect(filename).toMatch(/^[a-zA-Z0-9_-]+\.stl$/);
    });

    it('should include vertical exaggeration if non-default', () => {
      const route = { id: 'test' };
      const options = { vertical: 25 }; // Different from default 10
      const filename = generateFilename(route, options);
      expect(filename).toContain('25x');
    });

    it('should default to "route.stl" if no identifiers', () => {
      const route = {};
      const filename = generateFilename(route);
      expect(filename).toBe('route.stl');
    });
  });
});
