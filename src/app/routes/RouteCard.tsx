'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { RouteSummary } from '@contracts/contracts.ts';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';

// Copy with the async clipboard API; fall back to a selected hidden textarea on plain-HTTP or older browsers.
async function copyText(text: string) {
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(area); area.select();
  let done = false;
  try { done = document.execCommand('copy'); } catch { /* copy stays false */ }
  area.remove();
  return done;
}

function CopyLink({ label, url }: { label: string; url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    setState((await copyText(url)) ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  }
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <code>{url}</code>
        <div className="row">
          <Button variant="outline" size="sm" onClick={copy} aria-label={`Copy ${label} link`}>
            {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed. Select the link' : 'Copy link'}
          </Button>
          <Button variant="ghost" size="sm" asChild><a href={url}>Open</a></Button>
        </div>
      </dd>
    </div>
  );
}

/** A route on the dashboard. `compact` is the one-row draft form: no visitor links, because a draft has none. */
export function RouteCard({ route, origin, compact = false }: { route: RouteSummary; origin: string; compact?: boolean }) {
  const id = encodeURIComponent(route.id);
  const approved = route.approvedVersion !== null;
  const status = (
    <div className="route-status">
      {approved && <Badge variant="success">Approved · v{route.approvedVersion}</Badge>}
      {(!approved || route.latestStatus === 'draft') && <Badge variant="secondary">Draft · v{route.latestVersion}</Badge>}
      <Badge variant="outline">{route.checkpointCount} steps</Badge>
    </div>
  );
  if (compact) return (
    <li className="route-card route-card-compact">
      <div>
        <h3>{route.name}</h3>
        <p className="meta">To: {route.destinationLabel}</p>
        {status}
      </div>
      <Button variant="outline" asChild><Link href={`/teach?route=${id}`}>Review and approve</Link></Button>
    </li>
  );
  return (
    <li className="route-card">
      <h3>{route.name}</h3>
      {status}
      <p className="meta">To: {route.destinationLabel}</p>
      {approved
        ? <dl className="route-links">
            <CopyLink label="Live voice guide" url={`${origin}/follow/${id}?mode=stream`} />
            <CopyLink label="Camera check view" url={`${origin}/follow/${id}?mode=live`} />
          </dl>
        : <p className="meta">Approve this route to get visitor links.</p>}
      <div className="row">
        {approved && <Button asChild><a href={`/follow/${id}?mode=stream`}>Open live voice guide</a></Button>}
        <Button variant={approved ? 'outline' : 'default'} asChild><Link href={`/teach?route=${id}`}>Edit</Link></Button>
      </div>
    </li>
  );
}
