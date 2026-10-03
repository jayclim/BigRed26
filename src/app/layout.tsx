import type { Metadata, Viewport } from 'next';
import { MotionProvider } from '@/ui/MotionProvider';
import '@/ui/theme.css';

export const metadata: Metadata = {
  title: 'Breadcrumb (mock)',
  description: 'Record a route once. Let the next visitor follow it through their camera.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
