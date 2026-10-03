import { core } from '@/server/core/instance.ts';
import { respond } from '@/server/core/http.ts';

// Contract amendment 2: latest guidance re-rendered in the session's current locale.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(await core.currentGuidance((await params).id));
}
