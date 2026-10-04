// Local JSON persistence for bounties, same guarantees as ../core/store.ts: only a missing file starts empty; anything
// unreadable, unparseable or malformed is reported and left untouched on disk, so a bad file never turns into lost bounties.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FileSchema, type Bounty } from './types.ts';

export type LoadResult = { ok: true; bounties: Bounty[]; fresh: boolean } | { ok: false; message: string };

export function loadBounties(file: string): LoadResult {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, bounties: [], fresh: true };
    return { ok: false, message: `Can't read ${file} (${(e as NodeJS.ErrnoException).code ?? 'error'}). It was left unchanged.` };
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, message: `${file} is not valid JSON. It was left unchanged; fix or move it, then restart.` }; }
  const parsed = FileSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: `${file} doesn't look like Breadcrumb bounties (${parsed.error.issues[0]?.path.join('.') || 'root'}). It was left unchanged.` };
  const ids = new Set(parsed.data.bounties.map((b) => b.id));
  if (ids.size !== parsed.data.bounties.length) return { ok: false, message: `${file} has duplicate bounty ids. It was left unchanged.` };
  return { ok: true, bounties: parsed.data.bounties, fresh: false };
}

export function persistBounties(file: string, bounties: Bounty[]) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, bounties }));
  renameSync(tmp, file); // atomic replace: a crash mid-write never leaves a half file
}
