import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const NESTED_ITEM_MIN_H = 'min-h-[2.75rem]';

export function NestedTreeRoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative ml-2 pl-4 py-0.5', className)}>
      <div aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary/25" />
      <ul className="space-y-2.5 list-none m-0 p-0">{children}</ul>
    </div>
  );
}

export function NestedTreeItem({ children, isLast }: { children: ReactNode; isLast: boolean }) {
  return (
    <li className="relative pl-3">
      <div
        aria-hidden
        className={cn(
          'absolute left-0 top-0 w-3 border-l border-b border-primary/25 rounded-bl-md',
          isLast ? 'h-3.5' : '-bottom-2.5 border-b-0'
        )}
      />
      {children}
    </li>
  );
}

export function NestedTreeItemCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 shadow-sm',
        NESTED_ITEM_MIN_H,
        className
      )}
    >
      {children}
    </div>
  );
}

export function HorizontalIndent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('ml-2 border-l-2 border-primary/25 pl-3', className)}>{children}</div>;
}

export function AlignedStack({
  count,
  empty = '—',
  render,
}: {
  count: number;
  empty?: ReactNode;
  render: (index: number) => ReactNode;
}) {
  if (count === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-col gap-2.5 py-0.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn(NESTED_ITEM_MIN_H, 'flex items-start pt-0.5 text-xs')}>
          {render(index)}
        </div>
      ))}
    </div>
  );
}
