import { describe, it, expect, afterEach } from 'vitest';
import StravaAuth from '../../src/auth/strava-auth.js';

/**
 * Integration test for the stored-XSS fix on the "Recent Strava Activities"
 * modal (StravaAuth.prototype.showActivitiesList).
 *
 * Activity names are authored by arbitrary third-party Strava users and are
 * rendered via innerHTML, so a crafted name like
 * `<img src=x onerror=alert(1)>` would previously execute in the viewer's
 * browser and persist via IndexedDB. This test drives the real prototype
 * method (not a reimplementation) against a minimal fake `this`, avoiding
 * the need to run the full StravaAuth constructor (which kicks off OAuth
 * status checks and network calls not relevant to this sink).
 */
describe('StravaAuth.prototype.showActivitiesList XSS protection', () => {
    afterEach(() => {
        document.getElementById('strava-activities-modal')?.remove();
    });

    it('escapes a malicious activity name instead of injecting raw HTML', () => {
        const fakeThis = {
            recentActivitiesCache: null,
            createStravaActivitiesModal: StravaAuth.prototype.createStravaActivitiesModal,
        };

        const maliciousActivity = {
            id: '12345',
            name: '<img src=x onerror=alert(1)>',
            distance: 5000,
            sport_type: 'Ride',
            start_date_local: '2025-01-01T10:00:00Z',
        };

        StravaAuth.prototype.showActivitiesList.call(fakeThis, [maliciousActivity]);

        const modal = document.getElementById('strava-activities-modal');
        expect(modal).not.toBeNull();

        const content = modal.querySelector('.strava-modal-content').innerHTML;

        // The payload must be neutralized...
        expect(content).toContain('&lt;img src=x onerror=alert(1)&gt;');
        // ...and must NOT appear as live, executable markup.
        expect(content).not.toContain('<img src=x onerror=alert(1)>');

        // No actual <img> element should have been created in the DOM.
        expect(modal.querySelectorAll('img').length).toBe(0);
    });

    it('still renders a benign activity name correctly', () => {
        const fakeThis = {
            recentActivitiesCache: null,
            createStravaActivitiesModal: StravaAuth.prototype.createStravaActivitiesModal,
        };

        const activity = {
            id: '999',
            name: 'Morning Ride',
            distance: 10000,
            sport_type: 'Ride',
            start_date_local: '2025-01-01T10:00:00Z',
        };

        StravaAuth.prototype.showActivitiesList.call(fakeThis, [activity]);

        const modal = document.getElementById('strava-activities-modal');
        const content = modal.querySelector('.strava-modal-content').innerHTML;

        expect(content).toContain('Morning Ride');
    });
});
