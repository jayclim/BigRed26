'use client';
import { use } from 'react';
import { CreatorScreen } from '@/features/creator/CreatorScreen.tsx';
import { httpCore } from '@/client/httpCore.ts';

// `/` opens the demo route. `/?route=<id>` opens any stored route; the route dashboard (/routes) links here.
const DEFAULT_ROUTE_ID = 'demo-route';

export default function Page({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const { route } = use(searchParams);
  const routeId = typeof route === 'string' && route ? route : DEFAULT_ROUTE_ID;
  return <CreatorScreen core={httpCore} routeId={routeId} followPath={`/follow/${encodeURIComponent(routeId)}`} />;
}
