import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { isValidYear, isDateRangeWithinLimit, sanitizeActivityTypes } from '../../workers/strava-api.js';

const envMock = { STRAVA_CLIENT_ID: 'test-client-id', STRAVA_CLIENT_SECRET: 'test-client-secret' };
const COOKIE = 'rcm_strava_token=test-token';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isValidYear', () => {
    const currentYear = new Date().getFullYear();

    it('accepts a plausible 4-digit year', () => {
        expect(isValidYear('2024')).toBe(true);
        expect(isValidYear('2000')).toBe(true);
        expect(isValidYear(String(currentYear + 1))).toBe(true);
    });

    it('rejects years outside the allowed range', () => {
        expect(isValidYear('1999')).toBe(false);
        expect(isValidYear(String(currentYear + 2))).toBe(false);
    });

    it('rejects non-4-digit or non-numeric input', () => {
        expect(isValidYear('99')).toBe(false);
        expect(isValidYear('abcd')).toBe(false);
        expect(isValidYear('')).toBe(false);
        expect(isValidYear(undefined)).toBe(false);
    });
});

describe('isDateRangeWithinLimit', () => {
    it('accepts a range within 366 days', () => {
        const start = Date.UTC(2024, 0, 1);
        const end = Date.UTC(2024, 11, 31);
        expect(isDateRangeWithinLimit(start, end)).toBe(true);
    });

    it('rejects a range exceeding 366 days', () => {
        const start = Date.UTC(2020, 0, 1);
        const end = Date.UTC(2024, 0, 1);
        expect(isDateRangeWithinLimit(start, end)).toBe(false);
    });

    it('rejects NaN inputs', () => {
        expect(isDateRangeWithinLimit(NaN, Date.now())).toBe(false);
    });
});

describe('sanitizeActivityTypes', () => {
    it('keeps only known Strava sport types', () => {
        expect(sanitizeActivityTypes(['Ride', 'Run', 'NotAType', 'Hike'])).toEqual(['Ride', 'Run', 'Hike']);
    });

    it('returns an empty array for non-array input', () => {
        expect(sanitizeActivityTypes('Ride')).toEqual([]);
        expect(sanitizeActivityTypes(null)).toEqual([]);
        expect(sanitizeActivityTypes(undefined)).toEqual([]);
    });
});

describe('bulkImportActivities validation', () => {
    it('rejects invalid dates with 400', async () => {
        const request = new Request('https://routecoin.me/api/strava/bulk-import', {
            method: 'POST',
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: 'not-a-date', endDate: '2024-01-01' })
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
    });

    it('rejects a date range greater than 366 days', async () => {
        const request = new Request('https://routecoin.me/api/strava/bulk-import', {
            method: 'POST',
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2020-01-01', endDate: '2024-01-01' })
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
        const bodyJson = await response.json();
        expect(bodyJson.message).toMatch(/date range too large/);
    });

    it('accepts a valid request and reports truncated:false when under the cap', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const request = new Request('https://routecoin.me/api/strava/bulk-import', {
            method: 'POST',
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2024-01-01', endDate: '2024-01-31' })
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
        const bodyJson = await response.json();
        expect(bodyJson.truncated).toBe(false);
    });
});

describe('createYearCoin via /api/strava/year-coin (POST only)', () => {
    it('rejects GET requests (404, no longer routed)', async () => {
        const request = new Request('https://routecoin.me/api/strava/year-coin?year=2025', {
            method: 'GET',
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(404);
    });

    it('rejects an invalid year in the POST body', async () => {
        const request = new Request('https://routecoin.me/api/strava/year-coin', {
            method: 'POST',
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: '1899' })
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
    });

    it('falls back to current year and default types with an empty body', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const request = new Request('https://routecoin.me/api/strava/year-coin', {
            method: 'POST',
            headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
            body: ''
        });
        const response = await worker.fetch(request, envMock, {});
        // No activities found -> 404 "No activities found" (not a validation error)
        expect(response.status).toBe(404);
        const bodyJson = await response.json();
        expect(bodyJson.error).toBe('No activities found');
    });
});
