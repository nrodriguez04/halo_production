'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="grid min-h-full place-items-center p-8">
      <div className="w-full max-w-md animate-fade-up">
        <ErrorState
          title="Something went wrong"
          description={error.message || 'An unexpected error occurred. Please try again.'}
        />
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
