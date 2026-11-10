/**
 * The shape of the chain: which nodes there are, where they sit, what is connected to what, and in which order they appear.
 * Форма цепочки: какие ноды есть, где стоят, что с чем соединено и в каком порядке появляются.
 */
import { linkShape, type Side } from '@1337exp/taoux/curve';

export type NodeId =
    | 'deposit'
    | 'scenario'
    | 'bond'
    | 'accrual'
    | 'compound'
    | 'depositResult'
    | 'purchase'
    | 'coupons'
    | 'exit'
    | 'bondResult'
    | 'compare'
    | 'chart';

export type Branch = 'deposit' | 'bond' | 'both';

export interface NodeDef {
    id: NodeId;
    /** Where the chain it belongs to is: colour and meaning. / К какой ветке относится. */
    branch: Branch;
    /** 0: you type into it, always there. Others appear when the chain grows, in this order. / 0: в неё вносят, есть всегда; остальные появляются по порядку. */
    level: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface LinkDef {
    id: string;
    from: NodeId;
    fromSide: Side;
    to: NodeId;
    toSide: Side;
}

const W = 340;
const COL = [0, 420, 840] as const;
const ROW1 = 380;
const STEP = 252;

export const NODES: readonly NodeDef[] = [
    { id: 'deposit', branch: 'deposit', level: 0, x: COL[0], y: 0, w: W, h: 250 },
    { id: 'scenario', branch: 'both', level: 0, x: COL[1], y: 0, w: W, h: 310 },
    { id: 'bond', branch: 'bond', level: 0, x: COL[2], y: 0, w: W, h: 310 },

    { id: 'accrual', branch: 'deposit', level: 1, x: COL[0], y: ROW1, w: W, h: 200 },
    { id: 'compound', branch: 'deposit', level: 2, x: COL[0], y: ROW1 + STEP, w: W, h: 200 },
    { id: 'depositResult', branch: 'deposit', level: 3, x: COL[0], y: ROW1 + STEP * 2, w: W, h: 160 },

    { id: 'purchase', branch: 'bond', level: 1, x: COL[2], y: ROW1, w: W, h: 200 },
    { id: 'coupons', branch: 'bond', level: 2, x: COL[2], y: ROW1 + STEP, w: W, h: 200 },
    { id: 'exit', branch: 'bond', level: 3, x: COL[2], y: ROW1 + STEP * 2, w: W, h: 180 },
    { id: 'bondResult', branch: 'bond', level: 4, x: COL[2], y: ROW1 + STEP * 3, w: W, h: 210 },

    // Same height and row as the bond result: the link between them is a straight line, not a hook.
    // Той же высоты и в том же ряду, что итог облигации: связь между ними прямая, а не крючок.
    { id: 'compare', branch: 'both', level: 5, x: COL[1], y: ROW1 + STEP * 3, w: W, h: 210 },
    { id: 'chart', branch: 'both', level: 6, x: COL[1] + W / 2 - 400, y: ROW1 + STEP * 3 + 210 + 64, w: 800, h: 340 },
];

export const LAST_LEVEL = Math.max(...NODES.map((n) => n.level));

export const LINKS: readonly LinkDef[] = [
    { id: 'deposit-accrual', from: 'deposit', fromSide: 'bottom', to: 'accrual', toSide: 'top' },
    { id: 'accrual-compound', from: 'accrual', fromSide: 'bottom', to: 'compound', toSide: 'top' },
    { id: 'compound-depositResult', from: 'compound', fromSide: 'bottom', to: 'depositResult', toSide: 'top' },
    { id: 'scenario-accrual', from: 'scenario', fromSide: 'bottom', to: 'accrual', toSide: 'right' },

    { id: 'bond-purchase', from: 'bond', fromSide: 'bottom', to: 'purchase', toSide: 'top' },
    { id: 'purchase-coupons', from: 'purchase', fromSide: 'bottom', to: 'coupons', toSide: 'top' },
    { id: 'coupons-exit', from: 'coupons', fromSide: 'bottom', to: 'exit', toSide: 'top' },
    { id: 'exit-bondResult', from: 'exit', fromSide: 'bottom', to: 'bondResult', toSide: 'top' },
    { id: 'scenario-purchase', from: 'scenario', fromSide: 'bottom', to: 'purchase', toSide: 'left' },

    { id: 'depositResult-compare', from: 'depositResult', fromSide: 'bottom', to: 'compare', toSide: 'left' },
    { id: 'bondResult-compare', from: 'bondResult', fromSide: 'left', to: 'compare', toSide: 'right' },
    { id: 'compare-chart', from: 'compare', fromSide: 'bottom', to: 'chart', toSide: 'top' },
];

export type Positions = Record<NodeId, { x: number; y: number }>;

export const nodeDef = (id: NodeId): NodeDef => NODES.find((n) => n.id === id)!;

export function defaultPositions(): Positions {
    return Object.fromEntries(NODES.map((n) => [n.id, { x: n.x, y: n.y }])) as Positions;
}

/** A link appears together with the later of its two nodes. / Связь появляется вместе с более поздней из своих двух нод. */
export const linkLevel = (link: LinkDef): number => Math.max(nodeDef(link.from).level, nodeDef(link.to).level);

function pin(id: NodeId, side: Side, positions: Positions): [number, number] {
    const def = nodeDef(id);
    const { x, y } = positions[id];
    switch (side) {
        case 'top':
            return [x + def.w / 2, y];
        case 'bottom':
            return [x + def.w / 2, y + def.h];
        case 'left':
            return [x, y + def.h / 2];
        case 'right':
            return [x + def.w, y + def.h / 2];
    }
}

export interface Line {
    id: string;
    d: string;
    head: string | null;
    branch: Branch;
    level: number;
}

/** The drawn lines of the links that have appeared by `level`. / Линии связей, появившихся к уровню `level`. */
export function lines(positions: Positions, level: number, zoom: number): Line[] {
    return LINKS.filter((l) => linkLevel(l) <= level).map((l) => {
        const shape = linkShape(pin(l.from, l.fromSide, positions), l.fromSide, pin(l.to, l.toSide, positions), l.toSide, 'end', zoom);
        const branch = nodeDef(l.to).branch === 'both' ? nodeDef(l.from).branch : nodeDef(l.to).branch;
        return { id: l.id, d: shape.d, head: shape.head, branch, level: linkLevel(l) };
    });
}

/** The rectangle around the nodes visible at `level`. / Прямоугольник вокруг нод, видимых на уровне `level`. */
export function bounds(positions: Positions, level: number): { x: number; y: number; w: number; h: number } {
    const shown = NODES.filter((n) => n.level <= level);
    const x0 = Math.min(...shown.map((n) => positions[n.id].x));
    const y0 = Math.min(...shown.map((n) => positions[n.id].y));
    const x1 = Math.max(...shown.map((n) => positions[n.id].x + n.w));
    const y1 = Math.max(...shown.map((n) => positions[n.id].y + n.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
