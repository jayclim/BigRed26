'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand } from '@/ui/Brand.tsx';
import { LookToggle } from '@/ui/LookToggle.tsx';
import styles from './siteHeader.module.css';

const NAV = [
  { key: 'routes', label: 'Routes', href: '/#routes' },
  { key: 'bounties', label: 'Bounties', href: '/#bounties' },
  { key: 'teach', label: 'Teach', href: '/teach' },
] as const;

/** Top bar for every page except the live guides: the logo goes home, then Routes, Bounties and Teach. */
export function SiteHeader({ current, children }: { current?: (typeof NAV)[number]['key']; children?: ReactNode }) {
  return (
    <div className={`creator-top ${styles.bar}`}>
      <Link href="/" data-plain className={`brand-link ${styles.home}`} aria-label="Breadcrumb home"><Brand /></Link>
      <div className={styles.right}>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map((n) => n.key === 'teach'
            // ponytail: a full page load always starts /teach empty, even after a draft changed the URL in place
            ? <a key={n.key} href={n.href} data-plain aria-current={current === n.key ? 'page' : undefined}>{n.label}</a>
            : <Link key={n.key} href={n.href} data-plain aria-current={current === n.key ? 'page' : undefined}>{n.label}</Link>)}
          <LookToggle className={styles.look} />
        </nav>
        {children}
      </div>
    </div>
  );
}
