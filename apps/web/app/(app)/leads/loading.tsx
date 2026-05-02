import { Skeleton, SkeletonTableRow } from '@/components/skeleton';

export default function LeadsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="h-10 w-72" />
      <div className="rounded-lg border border-border bg-card">
        <Skeleton className="h-12 w-32 m-4" />
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonTableRow key={i} cols={4} />
        ))}
      </div>
    </div>
  );
}
