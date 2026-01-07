import * as React from "react"
import { containsArabic, containsEnglish } from "@/utils/textDirection"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onPaste, ...props }, ref) => {
    // Auto-detect direction for bidirectional text support
    const value = props.value as string | undefined;
    const hasArabic = value && containsArabic(value);
    const hasEnglish = value && containsEnglish(value);
    const isMixed = hasArabic && hasEnglish;
    
    // Use 'auto' for mixed content, specific direction for single-language content
    const dir = isMixed ? 'auto' : (hasArabic ? 'rtl' : undefined);
    
    // Handle paste events from Excel - preserve bidirectional text
    const handlePaste = React.useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
      if (onPaste) {
        onPaste(e);
        return;
      }

      // Get pasted text
      const pastedText = e.clipboardData.getData('text/plain');
      
      // If pasted text contains mixed content, ensure it's preserved
      // The browser's default paste should handle this, but we can clean up if needed
      // For now, let the browser handle it naturally
    }, [onPaste]);
    
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        dir={dir}
        style={{
          unicodeBidi: dir === 'auto' ? 'plaintext' : (dir === 'rtl' ? 'embed' : undefined),
          textAlign: 'start', // Use 'start' instead of 'left' or 'right' for better bidi support
        }}
        onPaste={handlePaste}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
