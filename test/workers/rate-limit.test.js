import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { hashToken } from '../../workers/strava-api.js';

const COOKIE = 'rcm_strava_token=test-token';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('hashToken', () => {
    it('returns a 64-character hex string (SHA-256 digest)', async () => {
        const digest = await hashToken('some-access-token');
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is stable for the same input', async () => {
        const a = await hashToken('same-token');
        const b = await hashToken('same-token');
        expect(a).toBe(b);
    });

    it('differs for different input', async () => {
        const a = await hashToken('token-a');
        const b = await hashToken('token-b');
        expect(a).not.toBe(b);
    });
});

describe('per-token rate limiting on /api/strava/*', () => {
    it('proceeds normally when no API_RATE_LIMITER binding is present (local/dev/test)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const envMock = { STRAVA_CLIENT_ID: 'x', STRAVA_CLIENT_SECRET: 'y' };
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
    });

    it('returns 429 with Retry-After when the limiter rejects the request', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const envMock = {
            STRAVA_CLIENT_ID: 'x',
            STRAVA_CLIENT_SECRET: 'y',
            API_RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) }
        };
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        const body = await response.json();
        expect(body.error).toBe('Rate limit exceeded');
    });

    it('calls the limiter with a hashed key, not the raw token', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const limitMock = vi.fn(async () => ({ success: true }));
        const envMock = {
            STRAVA_CLIENT_ID: 'x',
            STRAVA_CLIENT_SECRET: 'y',
            API_RATE_LIMITER: { limit: limitMock }
        };
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Cookie: COOKIE }
        });
        await worker.fetch(request, envMock, {});
        expect(limitMock).toHaveBeenCalledTimes(1);
        const { key } = limitMock.mock.calls[0][0];
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(key).not.toBe('test-token');
    });

    it('allows the request through when the limiter approves it', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
        const envMock = {
            STRAVA_CLIENT_ID: 'x',
            STRAVA_CLIENT_SECRET: 'y',
            API_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) }
        };
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Cookie: COOKIE }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
    });
});
