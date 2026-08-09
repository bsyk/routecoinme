import { describe, it, expect } from 'vitest';
import RouteMapVisualization from '../../src/visualization/route-map.js';

// createRoutePopup builds HTML that Leaflet injects via bindPopup, so any
// user-controlled field in it is an XSS sink. Both routeData.filename and
// routeData.metadata.description (the latter sourced from a GPX <desc>, which a
// shared/third-party GPX file controls) must be escaped. We invoke the method
// via its prototype with a minimal fake `this` to avoid constructing the full
// Leaflet-backed class.
const fakeThis = {
    formatDuration: () => '1h',
    unitPreferences: {
        formatDistance: () => '10 km',
        formatElevation: () => '100 m',
    },
};

const buildPopup = (routeData) =>
    RouteMapVisualization.prototype.createRoutePopup.call(fakeThis, routeData);

describe('createRoutePopup XSS escaping', () => {
    const payload = '<img src=x onerror=alert(1)>';

    it('escapes a malicious filename', () => {
        const html = buildPopup({ filename: payload, distance: 1, elevationGain: 1 });
        expect(html).not.toContain(payload);
        expect(html).toContain('&lt;img');
    });

    it('escapes a malicious GPX description', () => {
        const html = buildPopup({
            filename: 'ok',
            distance: 1,
            elevationGain: 1,
            metadata: { description: payload },
        });
        expect(html).not.toContain(payload);
        expect(html).toContain('&lt;img');
    });

    it('renders benign content normally', () => {
        const html = buildPopup({
            filename: 'Morning Ride',
            distance: 1,
            elevationGain: 1,
            metadata: { description: 'A nice loop' },
        });
        expect(html).toContain('Morning Ride');
        expect(html).toContain('A nice loop');
    });
});
