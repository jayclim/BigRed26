'use client';
import { use, useEffect, useState } from 'react';
import { GuideScreen } from '@/features/guide/GuideScreen.tsx';
import { LiveStream } from '@/features/guide/LiveStream.tsx';
import { httpCore } from '@/client/httpCore.ts';
import { httpVoice, serverVoiceEnabled } from '@/client/voice.ts';

export default function Page({ params, searchParams }: {
  params: Promise<{ routeId: string }>; searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { routeId } = use(params);
  const { mode } = use(searchParams);
  // Generated voice only when the server says it is enabled. Otherwise the guide keeps its labeled browser speech.
  const [generated, setGenerated] = useState(false);
  useEffect(() => {
    let live = true;
    void serverVoiceEnabled().then((enabled) => { if (live) setGenerated(enabled); });
    return () => { live = false; };
  }, []);
  // The Gemini Live voice guide is the default. ?mode=live opens the camera check-view guide.
  if (mode === 'live') return <GuideScreen core={httpCore} routeId={routeId} exitHref="/#routes" voice={generated ? httpVoice : undefined} />;
  return <LiveStream routeId={routeId} exitHref="/#routes" />;
}
