import type { Metadata } from 'next';
import { BoardScreen } from './BoardScreen.tsx';

export const metadata: Metadata = { title: 'Route bounties · Breadcrumb', description: 'Ask for a route and pay the person who teaches it.' };

export default function Page() {
  return <BoardScreen />;
}
