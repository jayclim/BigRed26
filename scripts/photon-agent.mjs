// Breadcrumb iMessage agent. Long-lived process: Photon Spectrum delivers iMessages, this forwards each text to
// POST /api/agent/message (Grok picks the route there) and sends the reply back.
// Run: node scripts/photon-agent.mjs   (needs SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, BREADCRUMB_AGENT_SECRET)
import { Spectrum } from '@spectrum-ts/core';
import { imessage } from '@spectrum-ts/imessage';
import { createBusyState, forward, loadBridgeConfig } from '../src/server/agent/photonBridge.ts';

const loaded = loadBridgeConfig();
if (!loaded.ok) {
  console.error(`[photon-agent] Missing environment variables: ${loaded.missing.join(', ')}.`);
  console.error('[photon-agent] See stages/03-build/output/photon-grok-agent.md, section "Setup steps".');
  process.exit(1);
}
const { config } = loaded;

const app = await Spectrum({ projectId: config.projectId, projectSecret: config.projectSecret, providers: [imessage.config()] });
console.log(`[photon-agent] Connected to Photon. Forwarding texts to ${new URL(config.agentUrl).origin}. Message text is never logged.`);

let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; await app.stop().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const busy = createBusyState();
async function handle(space, message) {
  const reply = await forward(config, space.id, message.content.text, { busy });
  if (reply === null) return; // rate-limited sender already told to wait: stay silent so a flood does not burn line quota
  await space.responding(async () => { await message.reply(reply); });
}

for await (const [space, message] of app.messages) {
  if (message.direction === 'outbound' || message.content.type !== 'text' || !message.content.text.trim()) continue;
  // Not awaited: a slow Grok call for one person must not block others.
  void handle(space, message).catch((error) => console.error(`[photon-agent] Reply failed: ${error instanceof Error ? error.name : 'error'}`));
}
