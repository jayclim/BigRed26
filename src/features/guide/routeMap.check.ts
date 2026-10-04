import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Checkpoint, CheckpointAction, Direction, Route } from '../../../contracts/contracts.ts';
import { floorLabel, layoutRoute, type RouteLayout } from './routeMap.ts';

type Spec = Direction | null | Partial<CheckpointAction> & { direction?: Direction | null };
const action = (a: Partial<CheckpointAction>): CheckpointAction => ({ kind: 'other', target: 'Sign', side: null, targetFloor: null, steps: [], completion: { en: 'Done', es: 'Hecho' }, ...a });
function route(...specs: Spec[]): Checkpoint[] {
  const all = [...specs, null];
  return all.map((s, i) => {
    const obj = s !== null && typeof s === 'object';
    const { direction = null, ...a } = obj ? s : { direction: s as Direction | null };
    return { id: `c${i}`, order: i, label: `Step ${i}`, referenceViews: [], identifyingEvidence: [], approachDescription: '',
      instruction: { en: '', es: '' }, direction: i === all.length - 1 ? null : direction,
      ...(obj ? { action: action(a) } : {}), isDestination: i === all.length - 1 };
  });
}
const xy = (l: RouteLayout) => l.nodes.map((n) => [n.x, n.y]);
const unitSteps = (l: RouteLayout) => l.edges.every((e) => {
  const a = l.nodes[e.from], b = l.nodes[e.to];
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
});

const straight = layoutRoute(route('forward', 'forward'));
assert.deepEqual(xy(straight), [[0, 2], [0, 1], [0, 0]]);
assert.equal(straight.straight, false); assert.equal(straight.width, 0); assert.equal(straight.height, 2);
assert(straight.nodes.every((n) => n.side === 'right' && n.room === null && !n.lift));
assert.equal(straight.nodes[2].isDestination, true);
console.log('PASS straight route runs up the screen with labels on the right');

const left = layoutRoute(route('forward', 'left'));
assert.deepEqual(xy(left), [[1, 1], [1, 0], [0, 0]]);
assert.equal(left.nodes[1].side, 'right'); assert.equal(left.nodes[2].side, 'left');
const right = layoutRoute(route('forward', 'right'));
assert.deepEqual(xy(right), [[0, 1], [0, 0], [1, 0]]);
assert.equal(right.nodes[1].side, 'left'); assert.equal(right.nodes[2].side, 'right');
console.log('PASS left and right directions bend the line; labels avoid the horizontal edge');

const turn = layoutRoute(route('forward', { kind: 'turn', side: 'right' }));
assert.deepEqual(xy(turn), xy(right));
const door = layoutRoute(route('forward', { kind: 'door', side: 'left' }, { kind: 'pass_side', side: 'right' }));
assert.deepEqual(xy(door), [[0, 3], [0, 2], [0, 1], [0, 0]]);
console.log('PASS turn action with side bends; door and pass_side actions with side do not');

const floors = layoutRoute(route({ kind: 'elevator', targetFloor: '3' }, { kind: 'stairs', direction: 'up' }, { kind: 'stairs' }, 'down', 'forward'));
assert.deepEqual(floors.edges.map((e) => e.floor), [
  { targetFloor: '3', dir: null }, { targetFloor: null, dir: 'up' }, { targetFloor: null, dir: null }, { targetFloor: null, dir: 'down' }, null,
]);
assert.deepEqual(floorLabel(floors.edges[0].floor!, 'en'), { glyph: '↕', text: 'Floor 3' });
assert.deepEqual(floorLabel(floors.edges[0].floor!, 'es'), { glyph: '↕', text: 'Piso 3' });
assert.deepEqual(floorLabel(floors.edges[1].floor!, 'en'), { glyph: '▲', text: 'Up' });
assert.deepEqual(floorLabel(floors.edges[2].floor!, 'en'), { glyph: '↕', text: 'Change floor' });
assert.deepEqual(floorLabel(floors.edges[3].floor!, 'es'), { glyph: '▼', text: 'Baja' });
assert(floors.nodes.every((n) => n.x === 0));
console.log('PASS elevator with target floor, stairs with and without direction; floors never bend');

const loop = layoutRoute(route('right', 'right', 'right', 'right'));
assert.equal(loop.straight, true);
assert.deepEqual(xy(loop), [[0, 4], [0, 3], [0, 2], [0, 1], [0, 0]]);
const hook = layoutRoute(route('right', 'right', 'right'));
assert.equal(hook.straight, false); assert.deepEqual(xy(hook), [[0, 0], [1, 0], [1, 1], [0, 1]]);
assert.equal(hook.nodes[0].side, 'left'); assert.equal(hook.nodes[3].side, 'left');
console.log('PASS self-crossing route falls back to straight; a hook without crossing keeps its bends');

const across = layoutRoute(route('right', 'forward', 'left'));
assert.deepEqual(xy(across), [[0, 1], [1, 1], [2, 1], [2, 0]]);
assert.equal(across.nodes[1].lift, true); assert.equal(across.nodes[1].room, null);
assert.equal(across.nodes[0].side, 'left');
console.log('PASS a node inside a horizontal run lifts its label');

for (const file of ['contracts/fixture.v1.json', 'contracts/fixture.actions.v1.json']) {
  const r = JSON.parse(readFileSync(file, 'utf8')).route as Route;
  const l = layoutRoute(r.checkpoints);
  assert.equal(l.nodes.length, r.checkpoints.length); assert.equal(l.edges.length, r.checkpoints.length - 1);
  assert(unitSteps(l)); assert.equal(Math.min(...l.nodes.map((n) => n.x)), 0); assert.equal(Math.min(...l.nodes.map((n) => n.y)), 0);
  if (file.includes('actions')) {
    assert.deepEqual(xy(l), [[0, 4], [0, 3], [0, 2], [0, 1], [0, 0]]);
    assert.deepEqual(l.edges[1].floor, { targetFloor: '3', dir: null });
  } else assert.deepEqual(xy(l), [[1, 1], [1, 0], [0, 0]]);
}
console.log('PASS legacy and action fixtures lay out without fabricated bends');

for (const l of [straight, left, right, turn, door, floors, loop, hook, across]) assert(unitSteps(l));
assert.deepEqual(layoutRoute([]), { nodes: [], edges: [], width: 0, height: 0, straight: true });
console.log('PASS every edge is one equal step; empty route is safe');
