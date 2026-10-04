import { core } from '../../../../server/core/instance.ts';
import { liveTokenPost, liveTokenProbe } from '../../../../server/live/liveHttp.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // reads server env per request, never at build time
export const POST = (req: Request) => liveTokenPost(req, core);
export const GET = () => liveTokenProbe();
