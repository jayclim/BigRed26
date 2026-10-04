/** Breadcrumb wordmark: the route-trail motif (cyan crumbs on a dotted path, solid destination) plus the name.
 *  With `href` the mark is a link (a plain anchor, so a live guide releases its camera and microphone on the way out). */
export function Brand({ compact = false, href }: { compact?: boolean; href?: string }) {
  const body = (
    <>
      <svg viewBox="0 0 44 16" aria-hidden="true">
        <path d="M6 8 H38" stroke="var(--cyan)" strokeWidth="2.5" strokeDasharray="0.1 4.4" strokeLinecap="round" />
        <circle cx="6" cy="8" r="4" fill="var(--cyan)" />
        <circle cx="22" cy="8" r="4" fill="var(--cyan)" />
        <circle cx="38" cy="8" r="5" fill="currentColor" />
      </svg>
      <span className="brand-name">Breadcrumb</span>
    </>
  );
  const className = `brand${compact ? ' brand-compact' : ''}`;
  return href
    ? <a href={href} data-plain className={`${className} brand-link`} aria-label="Breadcrumb home">{body}</a>
    : <span className={className}>{body}</span>;
}
