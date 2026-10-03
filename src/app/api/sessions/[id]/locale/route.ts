import { LocaleBodySchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { body, respond } from '@/server/core/http.ts';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await body(req, LocaleBodySchema);
  if (b instanceof Response) return b;
  return respond(await core.setLocale((await params).id, b.locale));
}
