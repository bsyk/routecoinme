import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/escape-html.js';

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('leaves plain text unchanged', () => {
        expect(escapeHtml('Morning Ride')).toBe('Morning Ride');
        expect(escapeHtml('Alpe du Zwift - Segment 3')).toBe('Alpe du Zwift - Segment 3');
    });

    it('passes non-string values through untouched', () => {
        expect(escapeHtml(42)).toBe(42);
        expect(escapeHtml(null)).toBe(null);
        expect(escapeHtml(undefined)).toBe(undefined);
        expect(escapeHtml(true)).toBe(true);
        const obj = { foo: 'bar' };
        expect(escapeHtml(obj)).toBe(obj);
    });

    it('neutralizes a full img onerror XSS payload', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const escaped = escapeHtml(payload);
        expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(escaped).not.toContain('<img');
        expect(escaped.startsWith('&lt;img')).toBe(true);
    });

    it('escapes a combination of all special characters together', () => {
        const input = `<a href="x" onclick='y'>&</a>`;
        const escaped = escapeHtml(input);
        expect(escaped).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    });
});
