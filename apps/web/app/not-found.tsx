import type { Metadata } from 'next';
import { NotFoundView } from '@/components/not-found/not-found-view';

export const metadata: Metadata = {
  title: 'Page not found · Hålo',
  robots: { index: false },
};

/** Every unknown address, and every notFound() call, lands here. */
export default function NotFound() {
  return <NotFoundView />;
}
