import { agentMessagePost } from '../../../../server/agent/agentHttp.ts';
import { core } from '../../../../server/core/instance.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // reads server env per request, never at build time
export const POST = (req: Request) => agentMessagePost(req, core);
