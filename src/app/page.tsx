'use client';
import { use } from 'react';
import { redirect } from 'next/navigation';
import { CreatorScreen } from '@/features/creator/CreatorScreen.tsx';
import { httpCore } from '@/client/httpCore.ts';

// `/?route=<id>` opens a stored route in the creator. `/` has no default route, so it opens the route dashboard (/routes).
export default function Page({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const { route } = use(searchParams);
  const routeId = typeof route === 'string' ? route : '';
  if (!routeId) redirect('/routes');
  return <CreatorScreen core={httpCore} routeId={routeId} followPath={`/follow/${encodeURIComponent(routeId)}`} />;
}
