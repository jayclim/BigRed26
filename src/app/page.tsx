import { redirect } from 'next/navigation';
import { LandingScreen } from '@/features/landing/LandingScreen.tsx';

// The iMessage agent's number or address is shown only when the operator sets it. It is public contact data, never a secret.
const CONTACT = /^(\+?[\d\s().-]{7,24}|[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,})$/;
const agentContact = () => {
  const value = process.env.BREADCRUMB_AGENT_CONTACT?.trim();
  return value && CONTACT.test(value) ? value : null;
};

// `/` is the landing page. Old creator links (`/?route=<id>`) go to the creator at /teach.
export default async function Page({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const { route } = await searchParams;
  if (typeof route === 'string' && route) redirect(`/teach?route=${encodeURIComponent(route)}`);
  return <LandingScreen agentContact={agentContact()} />;
}
