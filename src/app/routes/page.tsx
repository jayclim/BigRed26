'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RouteSummary } from '@contracts/contracts.ts';
import { httpCore } from '@/client/httpCore.ts';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Brand } from '@/ui/Brand.tsx';

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

function RouteCard({ route, origin }: { route: RouteSummary; origin: string }) {
  const id = encodeURIComponent(route.id);
  const approved = route.approvedVersion !== null;
  return (
    <li className="route-card">
      <h2>{route.name}</h2>
      <div className="route-status">
        {approved && <Badge variant="success">Approved · v{route.approvedVersion}</Badge>}
        {(!approved || route.latestStatus === 'draft') && <Badge variant="secondary">Draft · v{route.latestVersion}</Badge>}
        <Badge variant="outline">{route.checkpointCount} steps</Badge>
      </div>
      <p className="meta">To: {route.destinationLabel}</p>
      {approved
        ? <dl className="route-links">
            <CopyLink label="Follow" url={`${origin}/follow/${id}`} />
            <CopyLink label="Live voice guide" url={`${origin}/follow/${id}?mode=stream`} />
          </dl>
        : <p className="meta">Approve this route to get visitor links.</p>}
      <div className="row">
        <Button variant={approved ? 'outline' : 'default'} asChild><Link href={`/?route=${id}`}>Edit</Link></Button>
      </div>
    </li>
  );
}

export default function Page() {
  const [origin, setOrigin] = useState('');
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setOrigin(window.location.origin);
    setError(null);
    httpCore.listRoutes().then((r) => {
      if (!active) return;
      if (r.ok) setRoutes(r.value); else setError(r.error.message);
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <main className="creator">
      <header>
        <div className="creator-top">
          <Brand />
          <div className="creator-context"><Link href="/" className="creator-nav">Teach a route</Link></div>
        </div>
        <div className="route-title"><h1>All routes</h1></div>
        <p className="notice">Open a route to edit it, or copy a visitor link once it is approved.</p>
      </header>
      {error && <div className="notice error" role="alert">
        <p>{error}</p>
        <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
      </div>}
      {!error && routes === null && <p role="status">Loading routes…</p>}
      {routes?.length === 0 && <p className="notice">No routes yet. <Link href="/" className="creator-nav">Teach the first route</Link>.</p>}
      {routes && routes.length > 0 && <ul className="route-list" aria-label="Routes">
        {routes.map((r) => <RouteCard key={r.id} route={r} origin={origin} />)}
      </ul>}
    </main>
  );
}
