import { describe, expect, it } from 'vitest';
import { bisect } from '@/core/solve';

describe('bisect', () => {
    it('finds a root of a rising function', () => {
        expect(bisect((x) => x * x, 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    });

    it('finds a root of a falling function', () => {
        expect(bisect((x) => 10 - x, 3, 0, 20)).toBeCloseTo(7, 12);
    });

    it('returns null when the target is outside the range', () => {
        expect(bisect((x) => x, 5, 0, 1)).toBeNull();
        expect(bisect((x) => -x, 5, 0, 1)).toBeNull();
    });

    it('returns an end that already hits the target', () => {
        expect(bisect((x) => x, 0, 0, 1)).toBe(0);
        expect(bisect((x) => x, 1, 0, 1)).toBe(1);
    });

    it('returns null when the function is not finite on the range', () => {
        expect(bisect(() => NaN, 1, 0, 1)).toBeNull();
    });
});
