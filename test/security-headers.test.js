import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Guard the static security headers file so key hardening directives can't be
// silently dropped. The file is served by Cloudflare's asset handler in prod.
// Vitest runs with cwd at the repo root.
const headersPath = path.resolve(process.cwd(), 'public/_headers');
const headers = readFileSync(headersPath, 'utf8');

// Extract just the Content-Security-Policy line for directive assertions.
const cspLine = headers
    .split('\n')
    .find(line => line.trim().startsWith('Content-Security-Policy:')) || '';

describe('static security headers (_headers)', () => {
    it('applies to all paths', () => {
        expect(headers).toMatch(/^\/\*/m);
    });

    it('defines a Content-Security-Policy', () => {
        expect(cspLine).toContain('Content-Security-Policy:');
    });

    it('blocks plugins/objects and framing (clickjacking + object vectors)', () => {
        expect(cspLine).toContain("object-src 'none'");
        expect(cspLine).toContain("frame-ancestors 'none'");
        expect(cspLine).toContain("base-uri 'none'");
    });

    it('restricts default-src and connect-src to self', () => {
        expect(cspLine).toContain("default-src 'self'");
        expect(cspLine).toContain("connect-src 'self'");
    });

    it('allows only the map tile + unpkg origins the app actually uses', () => {
        expect(cspLine).toContain('https://*.tile.openstreetmap.org');
        expect(cspLine).toContain('https://unpkg.com');
    });

    it('sets nosniff, frame-deny, referrer and HSTS headers', () => {
        expect(headers).toContain('X-Content-Type-Options: nosniff');
        expect(headers).toContain('X-Frame-Options: DENY');
        expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
        expect(headers).toContain('Strict-Transport-Security:');
    });
});
