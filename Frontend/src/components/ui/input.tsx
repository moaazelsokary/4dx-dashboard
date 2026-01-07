import * as React from "react"
import { containsArabic, containsEnglish } from "@/utils/textDirection"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onPaste, ...props }, ref) => {
    // Auto-detect direction based on first character
    // If starts with Arabic, entire field is RTL
    // If starts with English, entire field is LTR
    const value = props.value as string | undefined;
    let dir: 'rtl' | 'ltr' | undefined = undefined;
    
    if (value) {
      // Find first strong character (Arabic or English)
      for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char)) {
          dir = 'rtl';
          break;
        } else if (/[a-zA-Z]/.test(char)) {
          dir = 'ltr';
          break;
        }
      }
      
      // If no strong character found but contains Arabic, use RTL
      if (!dir && containsArabic(value)) {
        dir = 'rtl';
      }
    }
    
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
          unicodeBidi: dir ? 'plaintext' : undefined,
          textAlign: dir === 'rtl' ? 'right' : (dir === 'ltr' ? 'left' : 'start'),
        }}
        onPaste={handlePaste}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
