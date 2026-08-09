import { describe, it, expect } from 'vitest';
import worker, { generateState } from '../../workers/strava-api.js';

const envMock = { STRAVA_CLIENT_ID: 'test-client-id', STRAVA_CLIENT_SECRET: 'test-client-secret' };

describe('generateState', () => {
    it('returns a non-empty string', () => {
        const state = generateState();
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
    });

    it('returns unique values on successive calls', () => {
        const a = generateState();
        const b = generateState();
        expect(a).not.toBe(b);
    });
});

describe('/api/auth/login sets state cookie', () => {
    it('redirects to Strava with a state param and sets rcm_oauth_state cookie', async () => {
        const request = new Request('https://routecoin.me/api/auth/login');
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(302);
        const location = response.headers.get('Location');
        expect(location).toContain('state=');
        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('rcm_oauth_state=');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('SameSite=Lax');
    });
});

describe('/api/auth/callback state validation', () => {
    // On failure the callback (a full-page navigation) returns a friendly HTML
    // error page with a "Back to login" button, not JSON.
    const expectAuthErrorPage = async (response) => {
        expect(response.status).toBe(400);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const body = await response.text();
        expect(body).toContain('Back to login');
        expect(body).toContain('href="/api/auth/login"');
    };

    it('rejects when state is missing from the query string', async () => {
        const request = new Request('https://routecoin.me/api/auth/callback?code=abc', {
            headers: { Cookie: 'rcm_oauth_state=some-state' }
        });
        const response = await worker.fetch(request, envMock, {});
        await expectAuthErrorPage(response);
    });

    it('rejects when the state cookie is missing', async () => {
        const request = new Request('https://routecoin.me/api/auth/callback?code=abc&state=some-state');
        const response = await worker.fetch(request, envMock, {});
        await expectAuthErrorPage(response);
    });

    it('rejects when the query state and cookie state do not match', async () => {
        const request = new Request('https://routecoin.me/api/auth/callback?code=abc&state=query-state', {
            headers: { Cookie: 'rcm_oauth_state=cookie-state' }
        });
        const response = await worker.fetch(request, envMock, {});
        await expectAuthErrorPage(response);
    });

    it('shows a friendly page (not JSON) when the user denies access on Strava', async () => {
        const request = new Request('https://routecoin.me/api/auth/callback?error=access_denied');
        const response = await worker.fetch(request, envMock, {});
        expect(response.status).toBe(400);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const body = await response.text();
        expect(body).toContain('Back to login');
    });
});
