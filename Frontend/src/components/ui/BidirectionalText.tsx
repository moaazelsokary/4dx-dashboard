import { ReactNode } from 'react';
import { detectTextDirection, getDominantDirection } from '@/utils/textDirection';
import { cn } from '@/lib/utils';

interface BidirectionalTextProps {
  children: ReactNode;
  className?: string;
  /**
   * Force a specific direction, or 'auto' to detect automatically
   */
  dir?: 'ltr' | 'rtl' | 'auto';
  /**
   * Whether to use unicode-bidi for better mixed text handling
   */
  useUnicodeBidi?: boolean;
}

/**
 * Component for rendering mixed Arabic/English text with proper bidirectional support
 */
const BidirectionalText = ({
  children,
  className,
  dir = 'auto',
  useUnicodeBidi = true,
}: BidirectionalTextProps) => {
  // Convert children to string for direction detection
  const textContent = typeof children === 'string' 
    ? children 
    : typeof children === 'number'
    ? String(children)
    : '';

  // Determine direction
  let textDir: 'ltr' | 'rtl' | 'auto' = dir;
  if (dir === 'auto' && textContent) {
    textDir = detectTextDirection(textContent);
  }

  // For mixed content, use 'auto' and let browser handle it
  const finalDir = textDir === 'auto' ? getDominantDirection(textContent) : textDir;

  return (
    <span
      className={cn(className)}
      dir={finalDir}
      style={{
        unicodeBidi: useUnicodeBidi ? 'embed' : 'normal',
        textAlign: 'start', // Use 'start' instead of 'left' or 'right' for RTL support
      }}
    >
      {children}
    </span>
  );
};

export default BidirectionalText;

