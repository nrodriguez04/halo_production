import { Skeleton, SkeletonTableRow } from '@/components/skeleton';

export default function PropertiesLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-lg border border-border bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonTableRow key={i} cols={6} />
        ))}
      </div>
    </div>
  );
}
