import type { Metadata } from 'next';
import { BountyScreen } from '../BountyScreen.tsx';

export const metadata: Metadata = { title: 'Route bounty · Breadcrumb' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <BountyScreen id={(await params).id} />;
}
