'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-background p-8">
      <div className="w-full max-w-md animate-fade-up">
        <ErrorState
          title="Something went wrong"
          description={error.message || 'An unexpected error occurred. Please try again.'}
        />
        <div className="mt-4 flex justify-center">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
