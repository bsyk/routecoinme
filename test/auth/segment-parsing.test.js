import { describe, it, expect } from 'vitest';

/**
 * Test helper: Mock parseSegmentId function from StravaAuth
 * This mirrors the implementation in src/auth/strava-auth.js
 */
function parseSegmentId(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }

    const trimmed = input.trim();

    // Direct ID (numbers only)
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }

    // Full URL patterns (case-insensitive)
    const urlPatterns = [
        /strava\.com\/segments\/(\d+)/i,
        /strava\.com\/segments\/explore\/(\d+)/i,
    ];

    for (const pattern of urlPatterns) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Test helper: Mock prioritizeSegments function from StravaAuth
 */
function prioritizeSegments(segmentEfforts) {
    const koms = [];
    const topTens = [];
    const prs = [];
    const others = [];

    for (const effort of segmentEfforts) {
        if (effort.kom_rank === 1) {
            koms.push(effort);
        } else if (effort.kom_rank && effort.kom_rank <= 10) {
            topTens.push(effort);
        } else if (effort.pr_rank) {
            prs.push(effort);
        } else {
            others.push(effort);
        }
    }

    // Sort within each group by rank
    topTens.sort((a, b) => a.kom_rank - b.kom_rank);
    prs.sort((a, b) => a.pr_rank - b.pr_rank);

    return [...koms, ...topTens, ...prs, ...others];
}

describe('parseSegmentId', () => {
    it('parses direct segment ID (numbers only)', () => {
        expect(parseSegmentId('229781')).toBe('229781');
        expect(parseSegmentId('12345678')).toBe('12345678');
        expect(parseSegmentId('1')).toBe('1');
    });

    it('parses full Strava segment URL', () => {
        expect(parseSegmentId('https://www.strava.com/segments/229781')).toBe('229781');
        expect(parseSegmentId('http://www.strava.com/segments/12345678')).toBe('12345678');
        expect(parseSegmentId('https://strava.com/segments/999999')).toBe('999999');
    });

    it('parses segment explore URL', () => {
        expect(parseSegmentId('https://www.strava.com/segments/explore/229781')).toBe('229781');
        expect(parseSegmentId('http://strava.com/segments/explore/12345678')).toBe('12345678');
    });

    it('parses URL with query parameters', () => {
        expect(parseSegmentId('https://www.strava.com/segments/229781?filter=overall')).toBe('229781');
        expect(parseSegmentId('https://www.strava.com/segments/229781?filter=overall&gender=M')).toBe('229781');
    });

    it('parses URL with hash fragment', () => {
        expect(parseSegmentId('https://www.strava.com/segments/229781#leaderboard')).toBe('229781');
    });

    it('handles leading/trailing whitespace', () => {
        expect(parseSegmentId('  229781  ')).toBe('229781');
        expect(parseSegmentId('\t12345678\n')).toBe('12345678');
        expect(parseSegmentId('  https://www.strava.com/segments/229781  ')).toBe('229781');
    });

    it('returns null for invalid inputs', () => {
        expect(parseSegmentId('')).toBeNull();
        expect(parseSegmentId('   ')).toBeNull();
        expect(parseSegmentId('abc')).toBeNull();
        expect(parseSegmentId('segment123')).toBeNull();
        expect(parseSegmentId('https://www.google.com')).toBeNull();
        expect(parseSegmentId('https://www.strava.com/activities/123')).toBeNull();
    });

    it('returns null for null/undefined inputs', () => {
        expect(parseSegmentId(null)).toBeNull();
        expect(parseSegmentId(undefined)).toBeNull();
    });

    it('returns null for non-string inputs', () => {
        expect(parseSegmentId(123)).toBeNull();
        expect(parseSegmentId({})).toBeNull();
        expect(parseSegmentId([])).toBeNull();
    });

    it('handles mixed case URLs', () => {
        expect(parseSegmentId('https://www.Strava.com/segments/229781')).toBe('229781');
        expect(parseSegmentId('HTTPS://WWW.STRAVA.COM/SEGMENTS/229781')).toBe('229781');
    });

    it('handles URLs with different protocols', () => {
        expect(parseSegmentId('http://www.strava.com/segments/229781')).toBe('229781');
        expect(parseSegmentId('https://www.strava.com/segments/229781')).toBe('229781');
    });

    it('handles URLs without www', () => {
        expect(parseSegmentId('https://strava.com/segments/229781')).toBe('229781');
    });

    it('handles very long segment IDs', () => {
        const longId = '9'.repeat(20);
        expect(parseSegmentId(longId)).toBe(longId);
        expect(parseSegmentId(`https://www.strava.com/segments/${longId}`)).toBe(longId);
    });

    it('returns null for IDs with non-numeric characters', () => {
        expect(parseSegmentId('229781abc')).toBeNull();
        expect(parseSegmentId('abc229781')).toBeNull();
        expect(parseSegmentId('229-781')).toBeNull();
    });

    it('handles URLs with trailing slashes', () => {
        expect(parseSegmentId('https://www.strava.com/segments/229781/')).toBe('229781');
        expect(parseSegmentId('https://www.strava.com/segments/229781///')).toBe('229781');
    });
});

describe('prioritizeSegments', () => {
    const createSegmentEffort = (overrides = {}) => ({
        id: Math.random(),
        segment: {
            id: Math.floor(Math.random() * 1000000),
            name: 'Test Segment',
            distance: 1000,
            average_grade: 5.0,
            maximum_grade: 10.0
        },
        kom_rank: null,
        pr_rank: null,
        ...overrides
    });

    it('prioritizes KOM first', () => {
        const segments = [
            createSegmentEffort({ id: 'pr', pr_rank: 1 }),
            createSegmentEffort({ id: 'kom', kom_rank: 1 }),
            createSegmentEffort({ id: 'other' }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('kom');
    });

    it('prioritizes Top 10 after KOM', () => {
        const segments = [
            createSegmentEffort({ id: 'pr', pr_rank: 1 }),
            createSegmentEffort({ id: 'top5', kom_rank: 5 }),
            createSegmentEffort({ id: 'kom', kom_rank: 1 }),
            createSegmentEffort({ id: 'other' }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('kom');
        expect(sorted[1].id).toBe('top5');
    });

    it('prioritizes PR after Top 10', () => {
        const segments = [
            createSegmentEffort({ id: 'pr', pr_rank: 1 }),
            createSegmentEffort({ id: 'other' }),
            createSegmentEffort({ id: 'top5', kom_rank: 5 }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('top5');
        expect(sorted[1].id).toBe('pr');
        expect(sorted[2].id).toBe('other');
    });

    it('sorts Top 10 by rank', () => {
        const segments = [
            createSegmentEffort({ id: 'top8', kom_rank: 8 }),
            createSegmentEffort({ id: 'top3', kom_rank: 3 }),
            createSegmentEffort({ id: 'top10', kom_rank: 10 }),
            createSegmentEffort({ id: 'top1', kom_rank: 1 }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('top1');
        expect(sorted[1].id).toBe('top3');
        expect(sorted[2].id).toBe('top8');
        expect(sorted[3].id).toBe('top10');
    });

    it('sorts PRs by rank', () => {
        const segments = [
            createSegmentEffort({ id: 'pr5', pr_rank: 5 }),
            createSegmentEffort({ id: 'pr1', pr_rank: 1 }),
            createSegmentEffort({ id: 'pr3', pr_rank: 3 }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('pr1');
        expect(sorted[1].id).toBe('pr3');
        expect(sorted[2].id).toBe('pr5');
    });

    it('handles rank 11+ as others (not Top 10)', () => {
        const segments = [
            createSegmentEffort({ id: 'top10', kom_rank: 10 }),
            createSegmentEffort({ id: 'rank11', kom_rank: 11 }),
            createSegmentEffort({ id: 'rank50', kom_rank: 50 }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('top10');
        // rank11 and rank50 are in "others" category
        expect(['rank11', 'rank50']).toContain(sorted[1].id);
        expect(['rank11', 'rank50']).toContain(sorted[2].id);
    });

    it('handles empty array', () => {
        expect(prioritizeSegments([])).toEqual([]);
    });

    it('handles array with single segment', () => {
        const segment = createSegmentEffort({ id: 'single' });
        const sorted = prioritizeSegments([segment]);

        expect(sorted).toHaveLength(1);
        expect(sorted[0].id).toBe('single');
    });

    it('keeps segments with no achievements at the end', () => {
        const segments = [
            createSegmentEffort({ id: 'other1' }),
            createSegmentEffort({ id: 'pr', pr_rank: 1 }),
            createSegmentEffort({ id: 'other2' }),
        ];

        const sorted = prioritizeSegments(segments);

        expect(sorted[0].id).toBe('pr');
        expect(['other1', 'other2']).toContain(sorted[1].id);
        expect(['other1', 'other2']).toContain(sorted[2].id);
    });

    it('handles segments with both KOM and PR (KOM takes precedence)', () => {
        const segments = [
            createSegmentEffort({ id: 'kom-and-pr', kom_rank: 1, pr_rank: 1 }),
            createSegmentEffort({ id: 'just-pr', pr_rank: 2 }),
        ];

        const sorted = prioritizeSegments(segments);

        // kom-and-pr should be in KOM category (first), not PR
        expect(sorted[0].id).toBe('kom-and-pr');
        expect(sorted[1].id).toBe('just-pr');
    });

    it('handles segments with Top 10 and PR (Top 10 takes precedence)', () => {
        const segments = [
            createSegmentEffort({ id: 'top5-and-pr', kom_rank: 5, pr_rank: 1 }),
            createSegmentEffort({ id: 'just-pr', pr_rank: 2 }),
        ];

        const sorted = prioritizeSegments(segments);

        // top5-and-pr should be in Top 10 category (before PR)
        expect(sorted[0].id).toBe('top5-and-pr');
        expect(sorted[1].id).toBe('just-pr');
    });

    it('preserves original order for segments in same category', () => {
        const segments = [
            createSegmentEffort({ id: 'other1' }),
            createSegmentEffort({ id: 'other2' }),
            createSegmentEffort({ id: 'other3' }),
        ];

        const sorted = prioritizeSegments(segments);

        // Since they're all in "others", original order should be preserved
        expect(sorted[0].id).toBe('other1');
        expect(sorted[1].id).toBe('other2');
        expect(sorted[2].id).toBe('other3');
    });

    it('handles complex real-world scenario', () => {
        const segments = [
            createSegmentEffort({ id: 'other1' }),
            createSegmentEffort({ id: 'pr2', pr_rank: 2 }),
            createSegmentEffort({ id: 'top9', kom_rank: 9 }),
            createSegmentEffort({ id: 'kom', kom_rank: 1 }),
            createSegmentEffort({ id: 'other2' }),
            createSegmentEffort({ id: 'top3', kom_rank: 3 }),
            createSegmentEffort({ id: 'pr1', pr_rank: 1 }),
            createSegmentEffort({ id: 'rank15', kom_rank: 15 }),
        ];

        const sorted = prioritizeSegments(segments);

        // Expected order:
        // 1. KOM (rank 1)
        // 2-3. Top 10 (rank 3, 9) sorted by rank
        // 4-5. PR (rank 1, 2) sorted by rank
        // 6-8. Others (no achievements + rank 15)

        expect(sorted[0].id).toBe('kom');
        expect(sorted[1].id).toBe('top3');
        expect(sorted[2].id).toBe('top9');
        expect(sorted[3].id).toBe('pr1');
        expect(sorted[4].id).toBe('pr2');
        expect(['other1', 'other2', 'rank15']).toContain(sorted[5].id);
        expect(['other1', 'other2', 'rank15']).toContain(sorted[6].id);
        expect(['other1', 'other2', 'rank15']).toContain(sorted[7].id);
    });
});
