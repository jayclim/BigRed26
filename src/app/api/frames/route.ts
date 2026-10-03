import { core } from '@/server/core/instance.ts';
import { receiveFrame } from '@/server/frames/http.ts';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  return receiveFrame(req, core);
}
