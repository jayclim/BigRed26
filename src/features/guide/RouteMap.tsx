import { useMemo, type CSSProperties } from 'react';
import type { Checkpoint, Locale } from '@contracts/contracts.ts';
import { floorLabel, layoutRoute } from './routeMap.ts';
import styles from './guide.module.css';

const T = {
  en: {
    title: 'Route', notStarted: 'Not started', of: (i: number, n: number) => `${i} of ${n}`,
    summary: (n: number) => `Route map, ${n} steps. Not started.`,
    at: (i: number, n: number, l: string) => `Route map, step ${i} of ${n}: ${l}.`, next: (l: string) => ` Next: ${l}.`,
    arrived: (l: string) => `Route map: arrived at ${l}.`,
    status: { done: 'done', next: 'next', todo: 'not reached', arrived: 'arrived' } as Record<string, string>,
  },
  es: {
    title: 'Ruta', notStarted: 'Sin empezar', of: (i: number, n: number) => `${i} de ${n}`,
    summary: (n: number) => `Mapa de la ruta, ${n} pasos. Sin empezar.`,
    at: (i: number, n: number, l: string) => `Mapa de la ruta, paso ${i} de ${n}: ${l}.`, next: (l: string) => ` Siguiente: ${l}.`,
    arrived: (l: string) => `Mapa de la ruta: llegaste a ${l}.`,
    status: { done: 'hecho', next: 'siguiente', todo: 'pendiente', arrived: 'llegada' } as Record<string, string>,
  },
} as const;

const PAD = 20;
const px = (n: number) => `calc(50% + ${n}px)`;

/**
 * Schematic map. Position changes only with accepted guidance (`current`); nothing animates it.
 * `statuses` are the guide's existing per-checkpoint statuses, also read by the screen-reader list.
 * `flow` uses the cue condition and only adds three pulsing dots on the current → next edge.
 * Optional `title` and `note` replace the heading and the not-started text (creator preview).
 */
export function RouteMap({ checkpoints, statuses, current, guiding, flow, reduced, locale, name, title, note }: {
  checkpoints: Checkpoint[]; statuses: string[]; current: number; guiding: boolean; flow: boolean;
  reduced: boolean; locale: Locale; name: string; title?: string; note?: string;
}) {
  const t = T[locale];
  const heading = title ?? t.title;
  const layout = useMemo(() => layoutRoute(checkpoints), [checkpoints]);
  const n = checkpoints.length;
  const step = layout.width ? Math.max(32, Math.min(60, Math.floor(150 / layout.width))) : 60;
  const cx = (x: number) => (x - layout.width / 2) * step;
  const cy = (y: number) => PAD + y * step;
  const arrived = statuses[current] === 'arrived';
  const summary = current < 0 ? (note ? `${heading}, ${n} steps. ${note}.` : t.summary(n)) : arrived ? t.arrived(checkpoints[current].label)
    : t.at(current + 1, n, checkpoints[current].label) + (checkpoints[current + 1] ? t.next(checkpoints[current + 1].label) : '');
  const look = (i: number) => i === current ? (arrived ? 'arrived' : 'current') : statuses[i];
  const active = flow && current >= 0 && current < n - 1 ? layout.edges[current] : null;

  return (
    <section className={styles.mapCard} aria-labelledby="route-map-h">
      <div className={styles.cardHead}>
        <h2 id="route-map-h">{heading}</h2>
        <span>{current < 0 ? note ?? t.notStarted : t.of(current + 1, n)}</span>
      </div>
      <div className={styles.map} role="img" aria-label={summary} data-reduced={reduced || undefined}
        style={{ height: layout.height * step + PAD * 2 }}>
        {layout.edges.map((e, i) => {
          const a = layout.nodes[e.from], b = layout.nodes[e.to];
          const s = i < current ? 'done' : i === current && guiding ? 'active' : 'todo';
          const style: CSSProperties = a.x === b.x
            ? { left: px(cx(a.x) - 1), top: cy(Math.min(a.y, b.y)), width: 2, height: step }
            : { left: px(cx(Math.min(a.x, b.x))), top: cy(a.y) - 1, width: step, height: 2 };
          return <span key={i} className={styles.edge} data-s={s} style={style} />;
        })}
        {active && [1, 2, 3].map((k) => {
          const a = layout.nodes[active.from], b = layout.nodes[active.to];
          const x = cx(a.x + (b.x - a.x) * k / 4), y = cy(a.y + (b.y - a.y) * k / 4);
          return <span key={k} className={styles.edgeDot}
            style={{ left: px(x - 3), top: y - 3, animationDelay: `${(k - 1) * .18}s`, '--o': [.4, .7, 1][k - 1] } as CSSProperties} />;
        })}
        {layout.edges.map((e, i) => {
          if (!e.floor) return null;
          const a = layout.nodes[e.from], b = layout.nodes[e.to];
          const f = floorLabel(e.floor, locale);
          const style: CSSProperties = a.x === b.x
            ? { left: px(cx(a.x) + 10), top: cy((a.y + b.y) / 2), transform: 'translateY(-50%)' }
            : { left: px(cx((a.x + b.x) / 2)), top: cy(a.y) - 6, transform: 'translate(-50%, -100%)' };
          return <span key={`f${i}`} className={styles.floorChip} style={style}>{f.glyph} {f.text}</span>;
        })}
        {layout.nodes.map((node) => {
          const c = checkpoints[node.index];
          const x = cx(node.x), y = cy(node.y), r = node.isDestination ? 13 : 12;
          const right = node.side === 'right';
          const edge = right ? `calc(50% - ${x + r + 10}px)` : `calc(50% + ${x - r - 10}px)`;
          const label: CSSProperties = {
            top: y - (node.lift ? 20 : 0),
            [right ? 'left' : 'right']: px(right ? x + r + 6 : -x + r + 6),
            maxWidth: node.room ? `min(${Math.max(0, node.room * step - 2 * r - 12)}px, ${edge})` : edge,
          };
          return [
            <span key={c.id} className={styles.node} data-s={look(node.index)} data-dest={node.isDestination || undefined}
              style={{ left: px(x - r), top: y - r, width: 2 * r, height: 2 * r }}>
              {node.isDestination ? '◎' : node.index + 1}
            </span>,
            <span key={`${c.id}-l`} className={styles.nodeLabel} data-s={look(node.index)} style={label} title={c.label}>{c.label}</span>,
          ];
        })}
      </div>
      <ol className="sr-only" aria-label={name}>
        {checkpoints.map((c, i) => <li key={c.id}>{c.label}: {t.status[statuses[i]] ?? statuses[i]}</li>)}
      </ol>
    </section>
  );
}
