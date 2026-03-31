import { cn } from "@/lib/utils";

export function SkipLink({ className }: { className?: string }) {
  return (
    <a
      href="#main-content"
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]",
        "focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
    >
      Skip to content
    </a>
  );
}

