// Local JSON persistence for CoreState. Only a missing file is seeded; anything else that can't be
// read or parsed is reported and left untouched on disk, so a bad file never turns into lost routes.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { RouteSchema } from '../../../contracts/schemas.ts';
import type { CoreState } from './core.ts';

export type LoadResult = { ok: true; state: CoreState; seeded: boolean } | { ok: false; message: string };

// ponytail: routes are fully validated; sessions/events only by container shape. Tighten if files get hand-edited.
const StateShape = z.object({
  routes: z.record(z.string(), z.array(RouteSchema)),
  sessions: z.record(z.string(), z.object({ session: z.object({ id: z.string() }).loose() }).loose()),
  events: z.array(z.unknown()),
});

export function loadState(file: string, seed: () => CoreState): LoadResult {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, state: seed(), seeded: true };
    return { ok: false, message: `Can't read ${file} (${(e as NodeJS.ErrnoException).code ?? 'error'}). It was left unchanged.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: `${file} is not valid JSON. It was left unchanged; fix or move it, then restart.` };
  }
  const parsed = StateShape.safeParse(json);
  if (!parsed.success)
    return { ok: false, message: `${file} doesn't look like Breadcrumb data (${parsed.error.issues[0]?.path.join('.') || 'root'}). It was left unchanged.` };
  return { ok: true, state: json as CoreState, seeded: false };
}

export function persistState(file: string, state: CoreState) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, file); // atomic replace: a crash mid-write never leaves a half file
}
