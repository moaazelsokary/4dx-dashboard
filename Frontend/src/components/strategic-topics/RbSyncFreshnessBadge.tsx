import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

/** Last warehouse sync time (from rb_sync_metadata via dashboard summary). */
export function RbSyncFreshnessBadge({ at }: { at: string | null | undefined }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const rel = formatDistanceToNow(d, { addSuffix: true, includeSeconds: false });
  const stamp = format(d, 'MMM d, yyyy HH:mm');
  const ageMin = (Date.now() - d.getTime()) / 60_000;
  const fresh = ageMin < 6 * 60;
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground max-w-[min(100%,22rem)]">
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          fresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
        )}
      />
      <span className="truncate">
        Synced on {stamp} · {rel}
      </span>
    </div>
  );
}
