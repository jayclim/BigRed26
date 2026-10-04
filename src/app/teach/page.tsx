'use client';
import { use, useEffect, useState } from 'react';
import type { Route } from '@contracts/contracts.ts';
import { bountiesApi, type PublicBounty } from '@/client/bounties.ts';
import { httpCore } from '@/client/httpCore.ts';
import { CreatorScreen } from '@/features/creator/CreatorScreen.tsx';

type Params = { route?: string | string[]; bounty?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

// /teach starts a new route from a video. /teach?route=<id> edits a stored route.
// /teach?bounty=<id> answers a bounty: the new draft is named after it, and an approved route can be submitted to it.
export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = use(searchParams);
  const routeId = one(params.route);
  const bountyId = one(params.bounty);
  const [bounty, setBounty] = useState<PublicBounty | null>(null);
  const [bountyError, setBountyError] = useState<string | null>(null);

  useEffect(() => {
    setBounty(null); setBountyError(null);
    if (!bountyId) return;
    let live = true;
    void bountiesApi.get(bountyId).then((r) => { if (live) { if (r.ok) setBounty(r.value); else setBountyError(r.error.message); } });
    return () => { live = false; };
  }, [bountyId]);

  // Put the new route's id in the address bar so a reload or a shared link reopens the draft. The bounty stays in the URL.
  function onRouteCreated(route: Route) {
    const query = new URLSearchParams({ route: route.id });
    if (bountyId) query.set('bounty', bountyId);
    window.history.replaceState(null, '', `/teach?${query}`);
  }

  return <CreatorScreen core={httpCore} routeId={routeId || undefined} followPath={routeId ? `/follow/${encodeURIComponent(routeId)}` : undefined}
    bounty={bountyId ? { id: bountyId, loaded: bounty, error: bountyError } : undefined} onRouteCreated={onRouteCreated} />;
}
