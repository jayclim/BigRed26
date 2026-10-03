import type { Guidance, VoiceAdapter } from '../../../contracts/contracts.ts';

// Part C maps this guide token to a server-side voice id.
export const DEFAULT_VOICE_ID = 'default';
export interface AudioLike {
  play(): Promise<void>;
  pause(): void;
  src: string;
}
export type VoiceStatus = 'unavailable' | null;

export function createVoicePlayer({ voice, createAudio, voiceId = DEFAULT_VOICE_ID, onStatus }: {
  voice: VoiceAdapter;
  createAudio: (url: string) => AudioLike;
  voiceId?: string;
  onStatus: (status: VoiceStatus) => void;
}) {
  let generation = 0;
  let disposed = false;
  let currentKey: string | null = null;
  let audio: AudioLike | null = null;

  function cancel() {
    generation++;
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
  }
  function stop() {
    cancel();
    currentKey = null;
    if (!disposed) onStatus(null);
  }
  async function speak(guidance: Guidance) {
    if (disposed) return;
    const key = JSON.stringify([guidance.instructionId, guidance.locale, guidance.text]);
    if (currentKey === key) return;
    cancel();
    currentKey = key;
    const token = generation;
    const isCurrent = () => !disposed && token === generation;
    try {
      const result = await voice.synthesize({ text: guidance.text, locale: guidance.locale,
        voiceId, instructionId: guidance.instructionId });
      if (!isCurrent()) return;
      if (!result.ok) { onStatus('unavailable'); return; }
      audio = createAudio(result.value.audioUrl);
      await audio.play();
      if (isCurrent()) onStatus(null);
    } catch {
      if (isCurrent()) {
        cancel();
        onStatus('unavailable');
      }
    }
  }
  return { speak, stop, dispose() { disposed = true; stop(); } };
}
