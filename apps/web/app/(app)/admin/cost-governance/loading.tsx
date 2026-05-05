import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader2 size={20} className="mr-2 animate-spin" />
      Loading cost governance...
    </div>
  );
}
