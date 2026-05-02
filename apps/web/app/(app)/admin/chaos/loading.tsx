import { Skeleton, SkeletonCard, SkeletonTableRow } from '@/components/skeleton';

export default function ChaosLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-9 w-28" />
      </div>
      <SkeletonCard className="h-40" />
      <div className="rounded-lg border border-border bg-card">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonTableRow key={i} cols={5} />
        ))}
      </div>
    </div>
  );
}
