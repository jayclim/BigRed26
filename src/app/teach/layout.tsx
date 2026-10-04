import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Teach a route · Breadcrumb', description: 'Record a walk-through video and approve the draft route.' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
