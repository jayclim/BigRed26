import { redirect } from 'next/navigation';

// The route dashboard is a section of the landing page. Old /routes links land on it.
export default function Page() {
  redirect('/#routes');
}
