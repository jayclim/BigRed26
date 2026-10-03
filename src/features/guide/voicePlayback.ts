import type { Guidance, VoiceAdapter } from '../../../contracts/contracts.ts';

// Part C maps this guide token to a server-side voice id.
export const DEFAULT_VOICE_ID = 'default';
export interface AudioLike {
  play(): Promise<void>;
  pause(): void;
  src: string;
}
export type VoiceStatus = 'unavailable' | null;

export function createVoicePlayer({ createAudio, voiceId = DEFAULT_VOICE_ID, onStatus }: {
  createAudio: (url: string) => AudioLike;
  voiceId?: string;
  onStatus: (status: VoiceStatus) => void;
}) {
  let generation = 0;
  let disposed = false;
  let current: { key: string; voice: VoiceAdapter } | null = null;
  let audio: AudioLike | null = null;

  function cancel() {
    generation++;
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }
  function stop() {
    cancel();
    current = null;
    if (!disposed) onStatus(null);
  }
  async function speak(voice: VoiceAdapter, guidance: Guidance) {
    if (disposed) return;
    const key = JSON.stringify([guidance.sessionId, guidance.instructionId, guidance.locale, guidance.text]);
    if (current?.key === key && (audio !== null || current.voice === voice)) return;
    cancel();
    current = { key, voice };
    const token = generation;
    const isCurrent = () => !disposed && token === generation;
    try {
      const result = await voice.synthesize({ text: guidance.text, locale: guidance.locale,
        voiceId, instructionId: guidance.instructionId });
      if (!isCurrent()) return;
      if (!result.ok) { current = null; onStatus('unavailable'); return; }
      audio = createAudio(result.value.audioUrl);
      await audio.play();
      if (isCurrent()) onStatus(null);
    } catch {
      if (isCurrent()) {
        cancel();
        current = null;
        onStatus('unavailable');
      }
    }
  }
  return { speak, stop, dispose() { disposed = true; stop(); } };
}
