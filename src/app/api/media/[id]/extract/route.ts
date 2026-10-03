import { core } from '@/server/core/instance.ts';
import { respond } from '@/server/core/http.ts';
import { disabledExtraction, extractDraft, geminiConfig, geminiEnabled, geminiGenerate } from '@/server/extraction/extraction.ts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = geminiConfig();
  if (!geminiEnabled(config)) return respond(disabledExtraction());
  return respond(await extractDraft((await params).id, {
    generate: geminiGenerate(config), signal: req.signal, core,
  }));
}
