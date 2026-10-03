'use client';
import { use } from 'react';
import { GuideScreen } from '@/features/guide/GuideScreen.tsx';
import { httpCore } from '@/client/httpCore.ts';

export default function Page({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  return <GuideScreen core={httpCore} routeId={routeId} exitHref="/" />;
}
