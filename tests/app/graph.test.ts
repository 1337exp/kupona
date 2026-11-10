import { describe, expect, it } from 'vitest';
import { LAST_LEVEL, LINKS, NODES, bounds, defaultPositions, linkLevel, lines, nodeDef, type NodeId } from '@/app/graph';

const ids = NODES.map((n) => n.id);

describe('the shape of the chain', () => {
    it('has every node once', () => {
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('connects only nodes that exist, with unique link ids', () => {
        for (const l of LINKS) {
            expect(ids, l.id).toContain(l.from);
            expect(ids, l.id).toContain(l.to);
        }
        expect(new Set(LINKS.map((l) => l.id)).size).toBe(LINKS.length);
    });

    it('feeds every node that is not typed into by some link, from a node that is there no later', () => {
        for (const n of NODES.filter((x) => x.level > 0)) {
            const feeding = LINKS.filter((l) => l.to === n.id);
            expect(feeding.length, n.id).toBeGreaterThan(0);
            expect(
                feeding.some((l) => nodeDef(l.from).level < n.level),
                n.id,
            ).toBe(true);
            for (const l of feeding) expect(nodeDef(l.from).level, `${l.id} must not come from the future`).toBeLessThanOrEqual(n.level);
        }
    });

    it('starts with the three nodes you type into', () => {
        expect(NODES.filter((n) => n.level === 0).map((n) => n.id).sort()).toEqual(['bond', 'deposit', 'scenario']);
    });

    it('has no gap in the levels', () => {
        for (let l = 0; l <= LAST_LEVEL; l++) expect(NODES.some((n) => n.level === l), `level ${l}`).toBe(true);
    });

    it('puts no two nodes on top of each other', () => {
        const p = defaultPositions();
        for (const a of NODES) {
            for (const b of NODES) {
                if (a.id >= b.id) continue;
                const overlap = p[a.id].x < p[b.id].x + b.w && p[b.id].x < p[a.id].x + a.w && p[a.id].y < p[b.id].y + b.h && p[b.id].y < p[a.id].y + a.h;
                expect(overlap, `${a.id} and ${b.id}`).toBe(false);
            }
        }
    });

    it('draws the deposit on the left and the bond on the right', () => {
        const p = defaultPositions();
        expect(p.deposit.x).toBeLessThan(p.scenario.x);
        expect(p.scenario.x).toBeLessThan(p.bond.x);
        for (const id of ['accrual', 'compound', 'depositResult'] as NodeId[]) expect(p[id].x).toBe(p.deposit.x);
        for (const id of ['purchase', 'coupons', 'exit', 'bondResult'] as NodeId[]) expect(p[id].x).toBe(p.bond.x);
    });
});

describe('what is visible at a level', () => {
    const p = defaultPositions();

    it('shows no links at the start and all of them at the end', () => {
        expect(lines(p, 0, 1)).toHaveLength(0);
        expect(lines(p, LAST_LEVEL, 1)).toHaveLength(LINKS.length);
    });

    it('shows a link together with the later of its two nodes', () => {
        for (const l of LINKS) expect(linkLevel(l)).toBe(Math.max(nodeDef(l.from).level, nodeDef(l.to).level));
        for (let level = 0; level <= LAST_LEVEL; level++) {
            const shown = new Set(lines(p, level, 1).map((x) => x.id));
            for (const l of LINKS) expect(shown.has(l.id), `${l.id} at ${level}`).toBe(linkLevel(l) <= level);
        }
    });

    it('draws a path and an arrowhead for every link', () => {
        for (const line of lines(p, LAST_LEVEL, 1)) {
            expect(line.d).toMatch(/^M [-\d. ]+ C /);
            expect(line.head).toMatch(/^M /);
        }
    });

    it('moves the end of a link with its node', () => {
        const moved = defaultPositions();
        moved.depositResult = { x: moved.depositResult.x - 100, y: moved.depositResult.y + 50 };
        const before = lines(p, LAST_LEVEL, 1).find((l) => l.id === 'depositResult-compare')!;
        const after = lines(moved, LAST_LEVEL, 1).find((l) => l.id === 'depositResult-compare')!;
        expect(after.d).not.toBe(before.d);
    });

    it('colours the link by the side it belongs to', () => {
        const byId = Object.fromEntries(lines(p, LAST_LEVEL, 1).map((l) => [l.id, l.branch]));
        expect(byId['deposit-accrual']).toBe('deposit');
        expect(byId['bond-purchase']).toBe('bond');
        expect(byId['compare-chart']).toBe('both');
        // a link into a shared node takes the colour of where it comes from / связь в общую ноду берёт цвет того, откуда идёт
        expect(byId['depositResult-compare']).toBe('deposit');
        expect(byId['bondResult-compare']).toBe('bond');
        expect(byId['rates-accrual']).toBe('deposit');
        expect(byId['rates-purchase']).toBe('bond');
        expect(byId['scenario-rates']).toBe('both');
    });

    it('leaves the bottom of one node and arrives at the top of the next', () => {
        const line = lines(p, LAST_LEVEL, 1).find((l) => l.id === 'deposit-accrual')!;
        const deposit = nodeDef('deposit');
        const accrual = nodeDef('accrual');
        const [, x0, y0] = /^M (\S+) (\S+)/.exec(line.d)!;
        expect([Number(x0), Number(y0)]).toEqual([p.deposit.x + deposit.w / 2, p.deposit.y + deposit.h]);
        const [, x1, y1] = /^M (\S+) (\S+)/.exec(line.head!)!;
        expect([Number(x1), Number(y1)]).toEqual([p.accrual.x + accrual.w / 2, p.accrual.y]);
    });

    it('leaves the left side of the bond result and arrives at the right side of the comparison', () => {
        const line = lines(p, LAST_LEVEL, 1).find((l) => l.id === 'bondResult-compare')!;
        const [, x0, y0] = /^M (\S+) (\S+)/.exec(line.d)!;
        expect([Number(x0), Number(y0)]).toEqual([p.bondResult.x, p.bondResult.y + nodeDef('bondResult').h / 2]);
        const [, x1, y1] = /^M (\S+) (\S+)/.exec(line.head!)!;
        expect([Number(x1), Number(y1)]).toEqual([p.compare.x + nodeDef('compare').w, p.compare.y + nodeDef('compare').h / 2]);
    });

    it('bounds the visible nodes and grows with the level', () => {
        const first = bounds(p, 0);
        const last = bounds(p, LAST_LEVEL);
        expect(first).toEqual({ x: 0, y: 0, w: p.bond.x + nodeDef('bond').w, h: Math.max(...NODES.filter((n) => n.level === 0).map((n) => n.h)) });
        const chart = nodeDef('chart');
        expect(last.h).toBe(p.chart.y + chart.h);
        expect(last.w).toBeGreaterThanOrEqual(first.w);
    });

    it('bounds follow a node that was moved', () => {
        const moved = defaultPositions();
        moved.chart = { x: moved.chart.x, y: moved.chart.y + 500 };
        expect(bounds(moved, LAST_LEVEL).h).toBe(bounds(p, LAST_LEVEL).h + 500);
    });
});
