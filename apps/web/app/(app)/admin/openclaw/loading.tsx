import { Skeleton, SkeletonCard } from '@/components/skeleton';

export default function OpenclawLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <SkeletonCard className="h-48" />
      <SkeletonCard className="h-64" />
    </div>
  );
}
