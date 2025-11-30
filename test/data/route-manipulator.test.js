import { describe, it, expect, beforeEach, vi } from 'vitest';
import RouteManipulator from '../../src/data/route-manipulator.js';

describe('RouteManipulator', () => {
    let manipulator;

    beforeEach(() => {
        manipulator = new RouteManipulator();
    });

    // Helper to create a simple test route
    const createTestRoute = (overrides = {}) => ({
        id: 'test-route-1',
        filename: 'test-route.gpx',
        points: [
            { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
            { lat: 0.01, lon: 0.01, elevation: 150, timestamp: '2024-01-01T10:05:00Z' },
            { lat: 0.02, lon: 0.02, elevation: 120, timestamp: '2024-01-01T10:10:00Z' },
            { lat: 0.03, lon: 0.03, elevation: 180, timestamp: '2024-01-01T10:15:00Z' }
        ],
        distance: 10.5,
        elevationGain: 110,
        elevationLoss: 30,
        duration: 900,
        uploadTime: Date.now(),
        ...overrides
    });

    describe('relocateRouteToPosition', () => {
        it('should relocate route start point to target position', () => {
            const route = createTestRoute();
            const targetLat = 45.0;
            const targetLon = -122.0;
            const targetElevation = 500;

            const relocated = manipulator.relocateRouteToPosition(route, targetLat, targetLon, targetElevation);

            expect(relocated.points[0].lat).toBe(targetLat);
            expect(relocated.points[0].lon).toBe(targetLon);
            expect(relocated.points[0].elevation).toBe(targetElevation);
        });

        it('should maintain relative positions of all points', () => {
            const route = createTestRoute();
            const originalOffset1 = route.points[1].lat - route.points[0].lat;
            const originalOffset2 = route.points[2].lon - route.points[1].lon;

            const relocated = manipulator.relocateRouteToPosition(route, 10.0, 20.0, 300);

            const newOffset1 = relocated.points[1].lat - relocated.points[0].lat;
            const newOffset2 = relocated.points[2].lon - relocated.points[1].lon;

            expect(newOffset1).toBeCloseTo(originalOffset1, 10);
            expect(newOffset2).toBeCloseTo(originalOffset2, 10);
        });

        it('should preserve original route data', () => {
            const route = createTestRoute();
            const relocated = manipulator.relocateRouteToPosition(route, 10.0, 20.0, 300);

            expect(relocated.id).toBe(route.id);
            expect(relocated.filename).toBe(route.filename);
            expect(relocated.distance).toBe(route.distance);
        });

        it('should throw error for route without points', () => {
            const route = { ...createTestRoute(), points: [] };

            expect(() => {
                manipulator.relocateRouteToPosition(route, 0, 0, 0);
            }).toThrow('Route must have points to relocate');
        });
    });

    describe('normalizeRoute', () => {
        it('should center route on (0, 0)', () => {
            const route = createTestRoute();
            const normalized = manipulator.normalizeRoute(route);

            // First point should be at the negative of the average latitude range
            // Latitudes are 0.0 to 0.03, average is 0.015
            expect(normalized.points[0].lat).toBe(-0.015);
            expect(normalized.points[0].lon).toBe(-0.015);
            expect(normalized.points[0].elevation).toBe(0);
        });

        it('should center route on (0, 0) if offset', () => {
            const route = createTestRoute({
                points: [
                    { lat: 100.0, lon: 50.0, elevation: 200 }, // Starts higher than it ends
                    { lat: 200.0, lon: 100.0, elevation: 100 }
                ]
            });
            const normalized = manipulator.normalizeRoute(route);

            // First point should be at the negative of the average latitude range
            // Latitudes are 100.0 to 200.0, average is 150.0 minus 100 = 50.0
            // Longitudes are 50.0 to 100.0, average is 75.0 minus 50 = 25.0
            // Elevation starts at 200, so first point elevation should be 200-100 = 100
            expect(normalized.points[0].lat).toBe(-50.0);
            expect(normalized.points[0].lon).toBe(-25.0);
            expect(normalized.points[0].elevation).toBe(100);
        });

        it('should preserve route shape', () => {
            const route = createTestRoute();
            const normalized = manipulator.normalizeRoute(route);

            // Calculate distances between consecutive points
            const originalDistances = [];
            const normalizedDistances = [];

            for (let i = 1; i < route.points.length; i++) {
                originalDistances.push(
                    manipulator.calculateDistance(
                        route.points[i - 1].lat, route.points[i - 1].lon,
                        route.points[i].lat, route.points[i].lon
                    )
                );
                normalizedDistances.push(
                    manipulator.calculateDistance(
                        normalized.points[i - 1].lat, normalized.points[i - 1].lon,
                        normalized.points[i].lat, normalized.points[i].lon
                    )
                );
            }

            // Distances should be preserved
            originalDistances.forEach((dist, i) => {
                expect(normalizedDistances[i]).toBeCloseTo(dist, 5);
            });
        });

        it('should throw error for route without points', () => {
            const route = { ...createTestRoute(), points: [] };

            expect(() => {
                manipulator.normalizeRoute(route);
            }).toThrow('Route must have points to normalize');
        });

        
    });

    describe('resizeRouteToFit', () => {
        it('should resize route to fit within maxRadius', () => {
            const route = createTestRoute({
                points: [
                    { lat: -1.0, lon: -1.0, elevation: 100 },
                    { lat: 1.0, lon: 1.0, elevation: 200 }
                ]
            });

            const resized = manipulator.resizeRouteToFit(route);
            const bounds = manipulator.getRouteBounds(resized);

            // Should fit within 90% of maxRadius (0.36 degrees)
            expect(bounds.latRange).toBeLessThanOrEqual(manipulator.maxRadius * 2 * 0.9);
            expect(bounds.lonRange).toBeLessThanOrEqual(manipulator.maxRadius * 2 * 0.9);
        });

        it('should preserve elevation values', () => {
            const route = createTestRoute();
            const originalElevations = route.points.map(p => p.elevation);

            const resized = manipulator.resizeRouteToFit(route);
            const resizedElevations = resized.points.map(p => p.elevation);

            resizedElevations.forEach((elev, i) => {
                expect(elev).toBe(originalElevations[i]);
            });
        });

        it('should scale distance proportionally', () => {
            const route = createTestRoute({ distance: 100 });
            const bounds = manipulator.getRouteBounds(route);
            const maxRange = Math.max(bounds.latRange, bounds.lonRange);
            const usableRadius = manipulator.maxRadius * 0.9;
            const expectedScaleFactor = (usableRadius * 2) / maxRange;

            const resized = manipulator.resizeRouteToFit(route);

            expect(resized.distance).toBeCloseTo(route.distance * expectedScaleFactor, 5);
        });

        it('should throw error for route without points', () => {
            const route = { ...createTestRoute(), points: [] };

            expect(() => {
                manipulator.resizeRouteToFit(route);
            }).toThrow('Route must have points to resize');
        });
    });

    describe('aggregateRoutes', () => {
        it('should connect two routes end-to-end', () => {
            const route1 = createTestRoute({
                id: 'route1',
                filename: 'route1.gpx',
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 }
                ]
            });

            const route2 = createTestRoute({
                id: 'route2',
                filename: 'route2.gpx',
                points: [
                    { lat: 1.0, lon: 1.0, elevation: 200 },
                    { lat: 1.01, lon: 1.01, elevation: 250 }
                ]
            });

            const aggregated = manipulator.aggregateRoutes([route1, route2]);

            // Second route should start where first route ended
            expect(aggregated.points[1].lat).toBeCloseTo(route1.points[1].lat, 5);
            expect(aggregated.points[1].lon).toBeCloseTo(route1.points[1].lon, 5);
        });

        it('should combine route statistics', () => {
            const route1 = createTestRoute({ distance: 10, elevationGain: 100, duration: 300 });
            const route2 = createTestRoute({ distance: 15, elevationGain: 150, duration: 400 });

            const aggregated = manipulator.aggregateRoutes([route1, route2]);

            // Each route has 4 points. We drop the first point of each combined route, so expect 7 points.
            expect(aggregated.points.length).toBe(7);
        });

        it('should return clone for single route', () => {
            const route = createTestRoute();
            const aggregated = manipulator.aggregateRoutes([route]);

            expect(aggregated.points.length).toBe(route.points.length);
            expect(aggregated.points[0]).toEqual(route.points[0]);
        });

        it('should aggregate multiple routes', () => {
            const routes = [
                createTestRoute({ id: 'r1', filename: 'r1.gpx' }),
                createTestRoute({ id: 'r2', filename: 'r2.gpx' }),
                createTestRoute({ id: 'r3', filename: 'r3.gpx' })
            ];

            const aggregated = manipulator.aggregateRoutes(routes);

            // Each route has 4 points. We drop the first point of each combined route, so expect 10 points.
            // 4 + 3 + 3 = 10
            expect(aggregated.points.length).toBe(10);
            expect(aggregated.metadata.combined).toBe(true);
        });

        it('should throw error for empty routes array', () => {
            expect(() => {
                manipulator.aggregateRoutes([]);
            }).toThrow('No routes provided for aggregation');
        });
    });

    describe('convertToCumulativeElevation', () => {
        it('should convert elevation to cumulative climbing', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 }, // +50
                    { lat: 0.02, lon: 0.02, elevation: 120 }, // -30 (no gain)
                    { lat: 0.03, lon: 0.03, elevation: 180 }  // +60
                ]
            });

            const cumulative = manipulator.convertToCumulativeElevation(route);

            expect(cumulative.points[0].elevation).toBe(0);
            expect(cumulative.points[1].elevation).toBe(50);
            expect(cumulative.points[2].elevation).toBe(50); // No change on descent
            expect(cumulative.points[3].elevation).toBe(110); // 50 + 60
        });

        it('should only count positive elevation changes', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 200 },
                    { lat: 0.01, lon: 0.01, elevation: 100 }, // -100 (no gain)
                    { lat: 0.02, lon: 0.02, elevation: 50 }   // -50 (no gain)
                ]
            });

            const cumulative = manipulator.convertToCumulativeElevation(route);

            expect(cumulative.points[0].elevation).toBe(0);
            expect(cumulative.points[1].elevation).toBe(0);
            expect(cumulative.points[2].elevation).toBe(0);
        });

        it('should update route metadata', () => {
            const route = createTestRoute();
            const cumulative = manipulator.convertToCumulativeElevation(route);

            expect(cumulative.metadata.elevationMode).toBe('cumulative');
            expect(cumulative.filename).toContain('Cumulative');
        });

        it('should throw error for route without points', () => {
            const route = { ...createTestRoute(), points: [] };

            expect(() => {
                manipulator.convertToCumulativeElevation(route);
            }).toThrow('Route must have points to convert elevation');
        });

        it('Should accumulate beyond 10000m', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 10000 },
                    { lat: 0.01, lon: 0.01, elevation: 15000 },
                    { lat: 0.02, lon: 0.02, elevation: 12000 },
                    { lat: 0.03, lon: 0.03, elevation: 18000 },
                    { lat: 0.04, lon: 0.03, elevation: 20000 },
                    { lat: 0.05, lon: 0.03, elevation: 25000 },
                    { lat: 0.06, lon: 0.03, elevation: 38000 },
                ]
            });

            const cumulative = manipulator.convertToCumulativeElevation(route);

            expect(cumulative.points[0].elevation).toBe(0);
            expect(cumulative.points[1].elevation).toBe(5000);
            expect(cumulative.points[2].elevation).toBe(5000);
            expect(cumulative.points[3].elevation).toBe(11000);
            expect(cumulative.points[4].elevation).toBe(13000);
            expect(cumulative.points[5].elevation).toBe(18000);
            expect(cumulative.points[6].elevation).toBe(31000);
        });
    });

    describe('convertToTimeDomain', () => {
        it('should aggregate points into time steps', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
                    { lat: 0.01, lon: 0.01, elevation: 150, timestamp: '2024-01-01T10:01:00Z' },
                    { lat: 0.02, lon: 0.02, elevation: 120, timestamp: '2024-01-01T10:02:00Z' },
                    { lat: 0.03, lon: 0.03, elevation: 180, timestamp: '2024-01-01T10:03:00Z' }
                ]
            });

            const startTime = new Date('2024-01-01T10:00:00Z');
            const endTime = new Date('2024-01-01T10:04:00Z');
            const stepSizeMs = 60000; // 1 minute

            const timeDomain = manipulator.convertToTimeDomain(route, startTime, endTime, stepSizeMs);

            expect(timeDomain.points.length).toBe(4); // 4 minutes
            expect(timeDomain.metadata.timeDomain).toBe(true);
        });

        it('should use highest elevation for each time step', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
                    { lat: 0.01, lon: 0.01, elevation: 200, timestamp: '2024-01-01T10:00:30Z' }, // Same minute, higher
                    { lat: 0.02, lon: 0.02, elevation: 150, timestamp: '2024-01-01T10:00:45Z' }  // Same minute, lower
                ]
            });

            const startTime = new Date('2024-01-01T10:00:00Z');
            const endTime = new Date('2024-01-01T10:01:00Z');
            const stepSizeMs = 60000;

            const timeDomain = manipulator.convertToTimeDomain(route, startTime, endTime, stepSizeMs);

            // Should pick the point with elevation 200
            expect(timeDomain.points[0].elevation).toBe(200);
        });

        it('should interpolate missing time steps', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
                    { lat: 0.03, lon: 0.03, elevation: 180, timestamp: '2024-01-01T10:03:00Z' } // Gap
                ]
            });

            const startTime = new Date('2024-01-01T10:00:00Z');
            const endTime = new Date('2024-01-01T10:04:00Z');
            const stepSizeMs = 60000;

            const timeDomain = manipulator.convertToTimeDomain(route, startTime, endTime, stepSizeMs);

            expect(timeDomain.points.length).toBe(4);
            // Middle points should be cloned from prior point
            expect(timeDomain.points[1].lat).toBe(timeDomain.points[0].lat);
            expect(timeDomain.points[2].lat).toBe(timeDomain.points[0].lat);
        });

        it('should throw error for invalid time range', () => {
            const route = createTestRoute();
            const startTime = new Date('2024-01-01T10:00:00Z');
            const endTime = new Date('2024-01-01T09:00:00Z'); // Before start

            expect(() => {
                manipulator.convertToTimeDomain(route, startTime, endTime, 60000);
            }).toThrow('startTime must be before endTime');
        });

        it('should throw error for route without timestamps', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 }
                ]
            });

            const startTime = new Date('2024-01-01T10:00:00Z');
            const endTime = new Date('2024-01-01T11:00:00Z');

            expect(() => {
                manipulator.convertToTimeDomain(route, startTime, endTime, 60000);
            }).toThrow('Route must have timestamped points for time domain conversion');
        });
    });

    describe('resampleRoute', () => {
        it('should upsample route to higher point count', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 1.0, lon: 1.0, elevation: 200 }
                ]
            });

            const resampled = manipulator.resampleRoute(route, 5);

            expect(resampled.points.length).toBe(5);
            // First and last should be preserved
            expect(resampled.points[0]).toEqual(route.points[0]);
            expect(resampled.points[4]).toEqual(route.points[1]);
        });

        it('should interpolate intermediate points when upsampling', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 1.0, lon: 1.0, elevation: 200 }
                ]
            });

            const resampled = manipulator.resampleRoute(route, 3);

            // Middle point should be interpolated
            expect(resampled.points[1].lat).toBeCloseTo(0.5, 5);
            expect(resampled.points[1].lon).toBeCloseTo(0.5, 5);
            expect(resampled.points[1].elevation).toBeCloseTo(150, 5);
        });

        it('should downsample route to lower point count', () => {
            const route = createTestRoute({
                points: Array.from({ length: 100 }, (_, i) => ({
                    lat: i * 0.01,
                    lon: i * 0.01,
                    elevation: 100 + i
                }))
            });

            const resampled = manipulator.resampleRoute(route, 10);

            expect(resampled.points.length).toBe(10);
        });

        it('should preserve first and last points', () => {
            const route = createTestRoute();
            const resampled = manipulator.resampleRoute(route, 10);

            expect(resampled.points[0]).toEqual(route.points[0]);
            expect(resampled.points[9]).toEqual(route.points[route.points.length - 1]);
        });

        it('should return clone if already at target count', () => {
            const route = createTestRoute();
            const targetCount = route.points.length;

            const resampled = manipulator.resampleRoute(route, targetCount);

            expect(resampled.points.length).toBe(targetCount);
            expect(resampled.points[0]).toEqual(route.points[0]);
        });

        it('should recalculate route statistics', () => {
            const route = createTestRoute();
            const resampled = manipulator.resampleRoute(route, 100);

            expect(resampled.distance).toBeGreaterThan(0);
            expect(resampled.elevationGain).toBeGreaterThanOrEqual(0);
        });

        it('should throw error for target count less than 2', () => {
            const route = createTestRoute();

            expect(() => {
                manipulator.resampleRoute(route, 1);
            }).toThrow('Target point count must be at least 2');
        });
    });

    describe('applyPredeterminedPath', () => {
        it('should load and apply predetermined path', async () => {
            // Mock fetch for predetermined path
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({
                        id: 'spiral',
                        filename: 'spiral.json',
                        points: Array.from({ length: 10000 }, (_, i) => ({
                            lat: Math.cos(i * 0.01) * 0.1,
                            lon: Math.sin(i * 0.01) * 0.1,
                            elevation: 0
                        })),
                        distance: 100,
                        elevationGain: 0,
                        metadata: { name: 'Spiral Path' }
                    }))
                })
            );

            const route = createTestRoute();
            const overlayed = await manipulator.applyPredeterminedPath(route, 'spiral.json');

            expect(overlayed.points.length).toBe(10000);
            expect(overlayed.metadata.predeterminedPath).toBe(true);
            expect(overlayed.metadata.pathTemplate).toBe('spiral.json');
        });

        it('should preserve original elevation data', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({
                        points: Array.from({ length: 100 }, (_, i) => ({
                            lat: i * 0.01,
                            lon: i * 0.01,
                            elevation: 0
                        }))
                    }))
                })
            );

            const route = createTestRoute({
                points: [
                    { lat: 0, lon: 0, elevation: 100 },
                    { lat: 1, lon: 1, elevation: 200 }
                ]
            });

            const overlayed = await manipulator.applyPredeterminedPath(route, 'test.json');

            // Elevation should be from original route, not template
            expect(overlayed.points.some(p => p.elevation > 0)).toBe(true);
        });

        it('should preserve original route statistics', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({
                        points: Array.from({ length: 100 }, (_, i) => ({
                            lat: i * 0.01,
                            lon: i * 0.01,
                            elevation: 0
                        })),
                        distance: 999, // Should be ignored
                        elevationGain: 999
                    }))
                })
            );

            const route = createTestRoute({ distance: 50, elevationGain: 100 });
            const overlayed = await manipulator.applyPredeterminedPath(route, 'test.json');

            // Should keep original stats
            expect(overlayed.distance).toBeCloseTo(50, 1);
            expect(overlayed.elevationGain).toBeCloseTo(100, 1);
        });

        it('should throw error for failed fetch', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found'
                })
            );

            const route = createTestRoute();

            await expect(
                manipulator.applyPredeterminedPath(route, 'missing.json')
            ).rejects.toThrow();
        });
    });

    describe('scaleElevation', () => {
        it('should scale elevation to target max height', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 0 },
                    { lat: 0.01, lon: 0.01, elevation: 100 },
                    { lat: 0.02, lon: 0.02, elevation: 200 }
                ]
            });

            const scaled = manipulator.scaleElevation(route, 1000);

            expect(scaled.points[0].elevation).toBe(0);
            expect(scaled.points[2].elevation).toBe(1000);
        });

        it('should preserve relative elevation differences', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 },
                    { lat: 0.02, lon: 0.02, elevation: 200 }
                ]
            });

            const scaled = manipulator.scaleElevation(route, 1000);

            const originalRatio = (150 - 100) / (200 - 100);
            const scaledRatio = (scaled.points[1].elevation - scaled.points[0].elevation) / 
                               (scaled.points[2].elevation - scaled.points[0].elevation);

            expect(scaledRatio).toBeCloseTo(originalRatio, 5);
        });

        it('should preserve original elevation in metadata', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 200 }
                ]
            });

            const scaled = manipulator.scaleElevation(route, 1000);

            expect(scaled.points[0].originalElevation).toBe(100);
            expect(scaled.points[1].originalElevation).toBe(200);
        });

        it('should handle flat routes without elevation variation', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 100 },
                    { lat: 0.02, lon: 0.02, elevation: 100 }
                ]
            });

            const scaled = manipulator.scaleElevation(route, 1000);

            // Should return unchanged elevations
            scaled.points.forEach(p => {
                expect(p.elevation).toBe(100);
            });
        });

        it('should recalculate elevation statistics', () => {
            const route = createTestRoute();
            const scaled = manipulator.scaleElevation(route, 5000);

            expect(scaled.elevationGain).toBeGreaterThan(0);
            expect(scaled.metadata.elevationScaled).toBe(true);
        });
    });

    describe('calculateDistance', () => {
        it('should calculate distance between two points', () => {
            const distance = manipulator.calculateDistance(0, 0, 0, 1);

            // Distance should be approximately 111km (1 degree longitude at equator)
            expect(distance).toBeCloseTo(111.19, 1);
        });

        it('should return 0 for same point', () => {
            const distance = manipulator.calculateDistance(45.0, -122.0, 45.0, -122.0);

            expect(distance).toBe(0);
        });

        it('should handle negative coordinates', () => {
            const distance = manipulator.calculateDistance(-45.0, -122.0, -45.0, -121.0);

            expect(distance).toBeGreaterThan(0);
        });
    });

    describe('calculateRouteStats', () => {
        it('should calculate total distance', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.0, lon: 1.0, elevation: 150 },
                    { lat: 0.0, lon: 2.0, elevation: 120 }
                ]
            });

            const stats = manipulator.calculateRouteStats(route);

            expect(stats.distance).toBeGreaterThan(0);
            expect(stats.distance).toBeCloseTo(222.38, 1); // ~2 degrees at equator
        });

        it('should calculate elevation gain and loss', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 }, // +50
                    { lat: 0.02, lon: 0.02, elevation: 120 }, // -30
                    { lat: 0.03, lon: 0.03, elevation: 180 }  // +60
                ]
            });

            const stats = manipulator.calculateRouteStats(route);

            expect(stats.elevationGain).toBe(110); // 50 + 60
            expect(stats.elevationLoss).toBe(30);
        });

        it('should calculate duration from timestamps', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
                    { lat: 0.01, lon: 0.01, elevation: 150, timestamp: '2024-01-01T10:05:00Z' },
                    { lat: 0.02, lon: 0.02, elevation: 120, timestamp: '2024-01-01T10:10:00Z' }
                ]
            });

            const stats = manipulator.calculateRouteStats(route);

            expect(stats.duration).toBe(600); // 10 minutes in seconds
        });

        it('should return zero stats for empty route', () => {
            const route = createTestRoute({ points: [] });
            const stats = manipulator.calculateRouteStats(route);

            expect(stats.distance).toBe(0);
            expect(stats.elevationGain).toBe(0);
            expect(stats.elevationLoss).toBe(0);
            expect(stats.duration).toBe(0);
        });

        it('should return zero stats for single point route', () => {
            const route = createTestRoute({
                points: [{ lat: 0.0, lon: 0.0, elevation: 100 }]
            });
            const stats = manipulator.calculateRouteStats(route);

            expect(stats.distance).toBe(0);
            expect(stats.elevationGain).toBe(0);
            expect(stats.elevationLoss).toBe(0);
        });

        it('should handle routes without timestamps', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 0.01, lon: 0.01, elevation: 150 }
                ]
            });

            const stats = manipulator.calculateRouteStats(route);

            expect(stats.duration).toBe(0);
        });
    });

    describe('getRouteBounds', () => {
        it('should calculate min/max coordinates', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 1.0, lon: 2.0, elevation: 300 },
                    { lat: -1.0, lon: -2.0, elevation: 50 }
                ]
            });

            const bounds = manipulator.getRouteBounds(route);

            expect(bounds.minLat).toBe(-1.0);
            expect(bounds.maxLat).toBe(1.0);
            expect(bounds.minLon).toBe(-2.0);
            expect(bounds.maxLon).toBe(2.0);
            expect(bounds.minElevation).toBe(50);
            expect(bounds.maxElevation).toBe(300);
        });

        it('should calculate ranges', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 2.0, lon: 3.0, elevation: 250 }
                ]
            });

            const bounds = manipulator.getRouteBounds(route);

            expect(bounds.latRange).toBe(2.0);
            expect(bounds.lonRange).toBe(3.0);
            expect(bounds.elevationRange).toBe(150);
        });

        it('should calculate center points', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100 },
                    { lat: 2.0, lon: 4.0, elevation: 200 }
                ]
            });

            const bounds = manipulator.getRouteBounds(route);

            expect(bounds.centerLat).toBe(1.0);
            expect(bounds.centerLon).toBe(2.0);
            expect(bounds.centerElevation).toBe(150);
        });

        it('should calculate timestamp bounds', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0, elevation: 100, timestamp: '2024-01-01T10:00:00Z' },
                    { lat: 1.0, lon: 1.0, elevation: 200, timestamp: '2024-01-01T11:00:00Z' }
                ]
            });

            const bounds = manipulator.getRouteBounds(route);

            expect(bounds.minTimestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
            expect(bounds.maxTimestamp).toBe(new Date('2024-01-01T11:00:00Z').getTime());
            expect(bounds.timestampRange).toBe(3600000); // 1 hour in ms
        });

        it('should return null for empty route', () => {
            const route = createTestRoute({ points: [] });
            const bounds = manipulator.getRouteBounds(route);

            expect(bounds).toBeNull();
        });

        it('should handle routes without elevation', () => {
            const route = createTestRoute({
                points: [
                    { lat: 0.0, lon: 0.0 },
                    { lat: 1.0, lon: 1.0 }
                ]
            });

            const bounds = manipulator.getRouteBounds(route);

            expect(bounds.minElevation).toBe(0);
            expect(bounds.maxElevation).toBe(0);
        });
    });
});
