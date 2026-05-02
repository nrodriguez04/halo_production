import { Skeleton, SkeletonCard } from '@/components/skeleton';

export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-44 lg:col-span-2" />
        <SkeletonCard className="h-32 lg:col-span-2" />
      </div>
    </div>
  );
}
