import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Handle wheel in capture phase so we run before Radix/document handlers that block scroll
    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const maxScroll = scrollHeight - clientHeight;

      if (e.deltaY > 0 && scrollTop < maxScroll) {
        viewport.scrollTop = Math.min(scrollTop + e.deltaY, maxScroll);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.deltaY < 0 && scrollTop > 0) {
        viewport.scrollTop = Math.max(scrollTop + e.deltaY, 0);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => viewport.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport 
        ref={viewportRef}
        className="h-full w-full rounded-[inherit]"
        style={{ 
          // Ensure pointer events work for scrolling
          pointerEvents: 'auto'
        }}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
})
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
