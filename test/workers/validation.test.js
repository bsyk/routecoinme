import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { isValidId, clampPerPage } from '../../workers/strava-api.js';

const envMock = { STRAVA_CLIENT_ID: 'test-client-id', STRAVA_CLIENT_SECRET: 'test-client-secret' };
const COOKIE = 'rcm_strava_token=test-token';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isValidId', () => {
    it('accepts plain digit strings', () => {
        expect(isValidId('123')).toBe(true);
        expect(isValidId('0')).toBe(true);
    });

    it('rejects non-numeric, empty, or malicious-looking ids', () => {
        expect(isValidId('abc')).toBe(false);
        expect(isValidId('')).toBe(false);
        expect(isValidId('123abc')).toBe(false);
        expect(isValidId('../etc/passwd')).toBe(false);
        expect(isValidId(undefined)).toBe(false);
        expect(isValidId(null)).toBe(false);
    });
});

describe('clampPerPage', () => {
    it('passes through values within 1..200', () => {
        expect(clampPerPage('50')).toBe(50);
        expect(clampPerPage('1')).toBe(1);
        expect(clampPerPage('200')).toBe(200);
    });

    it('clamps values above 200 down to 200', () => {
        expect(clampPerPage('500')).toBe(200);
    });

    it('clamps values below 1 up to 1', () => {
        expect(clampPerPage('0')).toBe(1);
        expect(clampPerPage('-5')).toBe(1);
    });

    it('falls back to a sane default for non-numeric input', () => {
        expect(clampPerPage('abc')).toBe(30);
        expect(clampPerPage(undefined)).toBe(30);
    });
});

describe('path-derived id validation via the fetch handler', () => {
    it('rejects a non-numeric activity id with 400', async () => {
        const request = new Request('https://routecoin.me/api/strava/activities/not-a-number', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Invalid id');
    });

    it('rejects a non-numeric import-activity id with 400', async () => {
        const request = new Request('https://routecoin.me/api/strava/import-activity/abc123', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
    });

    it('rejects a non-numeric segment id with 400', async () => {
        const request = new Request('https://routecoin.me/api/strava/segments/abc', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
    });

    it('rejects a non-numeric import-segment id with 400', async () => {
        const request = new Request('https://routecoin.me/api/strava/import-segment/abc', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
    });

    it('accepts a numeric activity id and proceeds to call Strava', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 123, name: 'Test' }), { status: 200 })));
        const request = new Request('https://routecoin.me/api/strava/activities/123', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
    });
});

describe('generic top-level error response', () => {
    it('does not leak internal error details to the client', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('sensitive internal stack trace details');
        }));
        const request = new Request('https://routecoin.me/api/auth/callback?code=abc&state=s', {
            headers: { Cookie: 'rcm_oauth_state=s' }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error).toBe('Internal server error');
        expect(body.message).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('sensitive internal stack trace details');
    });
});
