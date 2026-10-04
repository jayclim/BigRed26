'use client';
import { use, useEffect, useState } from 'react';
import { GuideScreen } from '@/features/guide/GuideScreen.tsx';
import { httpCore } from '@/client/httpCore.ts';
import { httpVoice, serverVoiceEnabled } from '@/client/voice.ts';

export default function Page({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  // Generated voice only when the server says it is enabled. Otherwise the guide keeps its labeled browser speech.
  const [generated, setGenerated] = useState(false);
  useEffect(() => {
    let live = true;
    void serverVoiceEnabled().then((enabled) => { if (live) setGenerated(enabled); });
    return () => { live = false; };
  }, []);
  return <GuideScreen core={httpCore} routeId={routeId} exitHref="/" voice={generated ? httpVoice : undefined} />;
}
