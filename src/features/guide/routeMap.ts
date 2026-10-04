import type { Checkpoint, Locale } from '../../../contracts/contracts.ts';

/** Schematic route map: equal unit steps, no distance meaning. Bends only where approved data turns. */
export interface FloorMark { targetFloor: string | null; dir: 'up' | 'down' | null }
export interface MapNode {
  id: string; index: number; x: number; y: number; isDestination: boolean;
  /** Label side, steps to the nearest node on that side of the row (null: none), and lift above a horizontal line. */
  side: 'left' | 'right'; room: number | null; lift: boolean;
}
export interface MapEdge { from: number; to: number; floor: FloorMark | null }
export interface RouteLayout { nodes: MapNode[]; edges: MapEdge[]; width: number; height: number; straight: boolean }

type Vec = [number, number];

function turnOf(c: Checkpoint): 'left' | 'right' | null {
  if (c.direction === 'left' || c.direction === 'right') return c.direction;
  return c.action?.kind === 'turn' && c.action.side ? c.action.side : null;
}

export function floorOf(c: Checkpoint): FloorMark | null {
  const dir = c.direction === 'up' || c.direction === 'down' ? c.direction : null;
  if (!dir && c.action?.kind !== 'elevator' && c.action?.kind !== 'stairs') return null;
  return { targetFloor: c.action?.targetFloor ?? null, dir };
}

const FLOOR_TEXT = {
  en: { floor: 'Floor', up: 'Up', down: 'Down', change: 'Change floor' },
  es: { floor: 'Piso', up: 'Sube', down: 'Baja', change: 'Cambio de piso' },
} as const;

/** Glyph is decorative; text carries the meaning. Unknown direction never shows up or down. */
export function floorLabel(f: FloorMark, locale: Locale) {
  const t = FLOOR_TEXT[locale];
  return {
    glyph: f.dir === 'up' ? '▲' : f.dir === 'down' ? '▼' : '↕',
    text: f.targetFloor ? `${t.floor} ${f.targetFloor}` : f.dir ? t[f.dir] : t.change,
  };
}

function walk(cps: Checkpoint[]): Vec[] {
  let h: Vec = [0, -1]; // forward is up the screen
  let p: Vec = [0, 0];
  const out = [p];
  for (const c of cps.slice(0, -1)) {
    const t = turnOf(c);
    if (t === 'left') h = [h[1], -h[0]];
    else if (t === 'right') h = [-h[1], h[0]];
    p = [p[0] + h[0], p[1] + h[1]];
    out.push(p);
  }
  return out;
}

export function layoutRoute(cps: Checkpoint[]): RouteLayout {
  if (!cps.length) return { nodes: [], edges: [], width: 0, height: 0, straight: true };
  let pos = walk(cps);
  // Unit axis-aligned edges on an integer grid meet only at nodes, so unique nodes also mean no overlapping edges.
  const straight = new Set(pos.map(([x, y]) => `${x},${y}`)).size !== pos.length;
  if (straight) pos = pos.map((_, i) => [0, -i]);
  const minX = Math.min(...pos.map((p) => p[0])), minY = Math.min(...pos.map((p) => p[1]));
  pos = pos.map(([x, y]) => [x - minX + 0, y - minY + 0]);
  const width = Math.max(0, ...pos.map((p) => p[0])), height = Math.max(0, ...pos.map((p) => p[1]));
  const at = new Set(pos.map(([x, y]) => `${x},${y}`));
  const nodes = pos.map(([x, y], i): MapNode => {
    const linked = (dx: number) => [i - 1, i + 1].some((j) => pos[j]?.[1] === y && pos[j]?.[0] === x + dx);
    const room = (dx: number) => {
      if (linked(dx)) return 0;
      for (let k = 1; k <= width; k++) if (at.has(`${x + dx * k},${y}`)) return k;
      return null;
    };
    const r = room(1), l = room(-1);
    const score = (v: number | null) => v ?? Infinity;
    const side = score(l) > score(r) ? 'left' : 'right';
    const lift = r === 0 && l === 0;
    return { id: cps[i].id, index: i, x, y, isDestination: cps[i].isDestination, side, room: lift ? null : side === 'left' ? l : r, lift };
  });
  const edges = cps.slice(0, -1).map((c, i): MapEdge => ({ from: i, to: i + 1, floor: floorOf(c) }));
  return { nodes, edges, width, height, straight };
}
