import type { ReactNode } from 'react';
import styles from '@/features/creator/creator.module.css';

/** The creator's page chrome (light page, static glow, centered column) for every non-guide page, so the site reads as one product. */
export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main className={`creator ${styles.page} ${className}`}>
      <div className={`creator-glow ${styles.glow}`} aria-hidden="true" />
      <div className={styles.inner}>{children}</div>
    </main>
  );
}
