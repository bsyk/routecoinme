import { describe, it, expect } from 'vitest';

// Import the conversion function - we'll need to extract it or mock it
// Since the worker is not directly importable, we'll test the conversion logic

/**
 * Test helper: Mock convertStravaSegmentToRoute function
 * This mirrors the implementation in workers/strava-api.js
 */
function convertStravaSegmentToRoute(segment, streams) {
    const { latlng, altitude, distance } = streams;

    if (!latlng || !latlng.data || latlng.data.length === 0) {
        throw new Error('No GPS data available for this segment');
    }

    // Map GPS points with elevation
    const points = latlng.data.map((coord, index) => ({
        lat: coord[0],
        lon: coord[1],
        elevation: altitude?.data ? altitude.data[index] || 0 : 0,
        timestamp: null // Segments don't have timestamps
    }));

    // Calculate elevation gain from points
    let elevationGain = 0;
    for (let i = 1; i < points.length; i++) {
        const elevDiff = points[i].elevation - points[i - 1].elevation;
        if (elevDiff > 0) {
            elevationGain += elevDiff;
        }
    }

    // Return route in the format expected by the client
    return {
        id: `strava_segment_${segment.id}`,
        filename: `${segment.name}.gpx`,
        name: segment.name,
        type: 'segment',
        points: points,
        distance: segment.distance / 1000, // Convert meters to km
        elevationGain: elevationGain,
        duration: null,
        startTime: null,
        source: 'strava-segment',
        metadata: {
            stravaSegmentId: segment.id,
            averageGrade: segment.average_grade || 0,
            maximumGrade: segment.maximum_grade || 0,
            climbCategory: segment.climb_category || 0,
            elevationHigh: segment.elevation_high || 0,
            elevationLow: segment.elevation_low || 0,
            city: segment.city || null,
            state: segment.state || null,
            country: segment.country || null,
            imported: expect.any(String) // Dynamic timestamp
        }
    };
}

describe('convertStravaSegmentToRoute', () => {
    const createMockSegment = (overrides = {}) => ({
        id: 229781,
        name: 'Hawk Hill',
        distance: 1234.5, // meters
        average_grade: 5.7,
        maximum_grade: 14.2,
        elevation_high: 245.3,
        elevation_low: 115.6,
        climb_category: 3,
        city: 'Mill Valley',
        state: 'CA',
        country: 'United States',
        ...overrides
    });

    const createMockStreams = (overrides = {}) => ({
        latlng: {
            data: [
                [37.8534, -122.4987],
                [37.8535, -122.4988],
                [37.8536, -122.4989]
            ]
        },
        altitude: {
            data: [115.6, 125.0, 135.0]
        },
        distance: {
            data: [0, 411.5, 823.0]
        },
        ...overrides
    });

    it('converts segment and streams to route format', () => {
        const segment = createMockSegment();
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.id).toBe('strava_segment_229781');
        expect(route.filename).toBe('Hawk Hill.gpx');
        expect(route.name).toBe('Hawk Hill');
        expect(route.type).toBe('segment');
        expect(route.source).toBe('strava-segment');
        expect(route.distance).toBeCloseTo(1.2345, 4); // km
        expect(route.duration).toBeNull();
        expect(route.startTime).toBeNull();
    });

    it('converts GPS points correctly', () => {
        const segment = createMockSegment();
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.points).toHaveLength(3);
        expect(route.points[0]).toEqual({
            lat: 37.8534,
            lon: -122.4987,
            elevation: 115.6,
            timestamp: null
        });
        expect(route.points[1]).toEqual({
            lat: 37.8535,
            lon: -122.4988,
            elevation: 125.0,
            timestamp: null
        });
    });

    it('calculates elevation gain correctly', () => {
        const segment = createMockSegment();
        const streams = createMockStreams({
            altitude: {
                data: [100, 120, 110, 130] // +20, -10, +20 = 40m gain
            },
            latlng: {
                data: [
                    [37.85, -122.50],
                    [37.85, -122.50],
                    [37.85, -122.50],
                    [37.85, -122.50]
                ]
            }
        });

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.elevationGain).toBe(40);
    });

    it('handles segment with no elevation changes', () => {
        const segment = createMockSegment();
        const streams = createMockStreams({
            altitude: {
                data: [100, 100, 100]
            }
        });

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.elevationGain).toBe(0);
    });

    it('handles segment with only elevation loss', () => {
        const segment = createMockSegment();
        const streams = createMockStreams({
            altitude: {
                data: [200, 150, 100]
            }
        });

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.elevationGain).toBe(0);
    });

    it('includes all segment metadata', () => {
        const segment = createMockSegment();
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.metadata).toMatchObject({
            stravaSegmentId: 229781,
            averageGrade: 5.7,
            maximumGrade: 14.2,
            climbCategory: 3,
            elevationHigh: 245.3,
            elevationLow: 115.6,
            city: 'Mill Valley',
            state: 'CA',
            country: 'United States'
        });
        expect(route.metadata.imported).toBeDefined();
    });

    it('handles missing optional segment fields', () => {
        const segment = {
            id: 123456,
            name: 'Simple Segment',
            distance: 1000
        };
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.metadata.averageGrade).toBe(0);
        expect(route.metadata.maximumGrade).toBe(0);
        expect(route.metadata.climbCategory).toBe(0);
        expect(route.metadata.city).toBeNull();
    });

    it('handles missing altitude data', () => {
        const segment = createMockSegment();
        const streams = {
            latlng: {
                data: [
                    [37.85, -122.50],
                    [37.85, -122.50]
                ]
            },
            distance: {
                data: [0, 500]
            }
            // No altitude data
        };

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.points[0].elevation).toBe(0);
        expect(route.points[1].elevation).toBe(0);
        expect(route.elevationGain).toBe(0);
    });

    it('throws error when latlng data is missing', () => {
        const segment = createMockSegment();
        const streams = {
            altitude: { data: [100, 200] }
            // Missing latlng
        };

        expect(() => {
            convertStravaSegmentToRoute(segment, streams);
        }).toThrow('No GPS data available for this segment');
    });

    it('throws error when latlng data is empty', () => {
        const segment = createMockSegment();
        const streams = {
            latlng: { data: [] },
            altitude: { data: [] }
        };

        expect(() => {
            convertStravaSegmentToRoute(segment, streams);
        }).toThrow('No GPS data available for this segment');
    });

    it('handles single point segment', () => {
        const segment = createMockSegment({ distance: 0 });
        const streams = {
            latlng: {
                data: [[37.85, -122.50]]
            },
            altitude: {
                data: [100]
            }
        };

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.points).toHaveLength(1);
        expect(route.elevationGain).toBe(0);
        expect(route.distance).toBe(0);
    });

    it('converts distance from meters to kilometers', () => {
        const segment = createMockSegment({ distance: 5000 }); // 5000m
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.distance).toBe(5); // 5km
    });

    it('generates unique ID based on segment ID', () => {
        const segment1 = createMockSegment({ id: 111 });
        const segment2 = createMockSegment({ id: 222 });
        const streams = createMockStreams();

        const route1 = convertStravaSegmentToRoute(segment1, streams);
        const route2 = convertStravaSegmentToRoute(segment2, streams);

        expect(route1.id).toBe('strava_segment_111');
        expect(route2.id).toBe('strava_segment_222');
        expect(route1.id).not.toBe(route2.id);
    });

    it('handles long segment names', () => {
        const segment = createMockSegment({
            name: 'Very Long Segment Name That Contains Many Words And Special Characters !@#'
        });
        const streams = createMockStreams();

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.name).toBe('Very Long Segment Name That Contains Many Words And Special Characters !@#');
        expect(route.filename).toBe('Very Long Segment Name That Contains Many Words And Special Characters !@#.gpx');
    });

    it('handles large elevation gain segments', () => {
        const segment = createMockSegment();
        // Simulate a big climb: 1000m elevation gain over 100 points
        const altitudeData = [];
        const latlngData = [];
        for (let i = 0; i < 100; i++) {
            altitudeData.push(100 + (i * 10)); // +10m per point
            latlngData.push([37.85 + (i * 0.0001), -122.50]);
        }

        const streams = {
            latlng: { data: latlngData },
            altitude: { data: altitudeData }
        };

        const route = convertStravaSegmentToRoute(segment, streams);

        expect(route.elevationGain).toBe(990); // 99 steps of 10m each
        expect(route.points).toHaveLength(100);
    });
});
