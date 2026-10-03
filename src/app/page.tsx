'use client';
import { CreatorScreen } from '@/features/creator/CreatorScreen.tsx';
import { httpCore } from '@/client/httpCore.ts';

// ponytail: one fixture route for the mock milestone; a route list arrives with real video builds.
const ROUTE_ID = 'demo-route';

export default function Page() {
  return <CreatorScreen core={httpCore} routeId={ROUTE_ID} followPath={`/follow/${ROUTE_ID}`} />;
}
