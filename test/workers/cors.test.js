import { describe, it, expect } from 'vitest';
import worker, { corsHeaders } from '../../workers/strava-api.js';

const envMock = { STRAVA_CLIENT_ID: 'test-client-id', STRAVA_CLIENT_SECRET: 'test-client-secret' };

describe('corsHeaders', () => {
    it('echoes an allowed origin and marks credentials allowed', () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Origin: 'https://routecoin.me' }
        });
        const headers = corsHeaders(request);
        expect(headers['Access-Control-Allow-Origin']).toBe('https://routecoin.me');
        expect(headers['Access-Control-Allow-Credentials']).toBe('true');
        expect(headers['Vary']).toBe('Origin');
    });

    it('allows the local Vite dev origin', () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Origin: 'http://localhost:3000' }
        });
        const headers = corsHeaders(request);
        expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });

    it('omits Access-Control-Allow-Origin for a disallowed origin', () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { Origin: 'https://evil.com' }
        });
        const headers = corsHeaders(request);
        expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('drops X-Strava-Token from allowed headers', () => {
        const request = new Request('https://routecoin.me/api/strava/activities');
        const headers = corsHeaders(request);
        expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    });
});

describe('OPTIONS preflight', () => {
    it('echoes ACAO and Allow-Credentials for an allowed origin', async () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            method: 'OPTIONS',
            headers: { Origin: 'https://routecoin.me' }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://routecoin.me');
        expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('has no Access-Control-Allow-Origin header for a disallowed origin', async () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            method: 'OPTIONS',
            headers: { Origin: 'https://evil.com' }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('getAuthToken cookie-only enforcement', () => {
    it('ignores X-Strava-Token header and requires the cookie', async () => {
        const request = new Request('https://routecoin.me/api/strava/activities', {
            headers: { 'X-Strava-Token': 'header-token' }
        });
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(401);
    });
});

describe('auth/status does not 500 on the CORS refactor', () => {
    it('returns 401 (not 500) when no token cookie is present', async () => {
        const request = new Request('https://routecoin.me/api/auth/status');
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.authenticated).toBe(false);
    });
});
