import Image from 'next/image';
import { cn } from '@/lib/utils';

/** The lockup is 574 x 192 (public/brand); the mark is square. */
const LOCKUP_RATIO = 574 / 192;

/**
 * The Hålo logo (apps/web/brand/halo-logo-original.png is the source; the
 * files in public/brand are cropped from it). `full` is the mark with the
 * wordmark, whose letters are white: it is for dark backgrounds, which is
 * every surface the app has. `mark` is the symbol alone.
 *
 * Served as is (`unoptimized`): the files are already sized, and nothing
 * here needs the image optimizer.
 */
export function Logo({
  variant = 'full',
  height = 24,
  className,
  priority,
}: {
  variant?: 'full' | 'mark';
  /** Rendered height in CSS pixels. */
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const full = variant === 'full';
  return (
    <Image
      src={full ? '/brand/halo-logo.png' : '/brand/halo-mark.png'}
      alt="Hålo"
      width={Math.round(full ? height * LOCKUP_RATIO : height)}
      height={height}
      unoptimized
      priority={priority}
      className={cn('select-none', className)}
      draggable={false}
    />
  );
}
