import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

function findScrollableParent(el: HTMLElement | null, boundary: HTMLElement): HTMLElement | null {
  while (el && el !== boundary) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, onWheelCapture, ...props }, ref) => {
  const handleWheelCapture = (e: React.WheelEvent) => {
    const scrollable = findScrollableParent(e.target as HTMLElement, e.currentTarget);
    if (scrollable) {
      const { scrollTop, scrollHeight, clientHeight } = scrollable;
      const maxScroll = scrollHeight - clientHeight;
      if (e.deltaY > 0 && scrollTop < maxScroll) {
        scrollable.scrollTop = Math.min(scrollTop + e.deltaY, maxScroll);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.deltaY < 0 && scrollTop > 0) {
        scrollable.scrollTop = Math.max(scrollTop + e.deltaY, 0);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    onWheelCapture?.(e);
  };
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        data-dropdown-content
        className={cn(
          "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        onWheelCapture={handleWheelCapture}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
