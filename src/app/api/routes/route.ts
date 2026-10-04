import { core } from '@/server/core/instance.ts';
import { respond } from '@/server/core/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // the list changes with every saved draft, never prerender it

export async function GET() {
  const res = respond(await core.listRoutes());
  res.headers.set('cache-control', 'no-store');
  return res;
}
