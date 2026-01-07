import { ReactNode, useMemo } from 'react';
import { containsArabic, containsEnglish, isNeutralChar } from '@/utils/textDirection';
import { cn } from '@/lib/utils';

interface BidirectionalTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Component for rendering mixed Arabic/English/Numbers/Symbols text with proper bidirectional support
 * Works like Excel - automatically detects and arranges mixed content correctly
 * Handles Arabic, English, numbers, and symbols without reversing or breaking them
 */
const BidirectionalText = ({
  children,
  className,
}: BidirectionalTextProps) => {
  // Convert children to string for processing
  const textContent = typeof children === 'string' 
    ? children 
    : typeof children === 'number'
    ? String(children)
    : '';

  // Process text to handle bidirectional content correctly
  const processedContent = useMemo(() => {
    if (!textContent) {
      return children;
    }

    const hasArabic = containsArabic(textContent);
    const hasEnglish = containsEnglish(textContent);
    const isMixed = hasArabic && hasEnglish;

    // If not mixed, use simple direction with proper bidi handling
    if (!isMixed) {
      const dir = hasArabic ? 'rtl' : 'ltr';
      return (
        <span 
          dir={dir} 
          style={{ 
            unicodeBidi: 'plaintext',
            textAlign: 'start',
          }}
        >
          {textContent}
        </span>
      );
    }

    // For mixed content, use Unicode bidirectional algorithm with proper isolation
    // This ensures correct ordering like Excel
    // Use dir="auto" to let browser detect based on first strong character
    // Use unicode-bidi: plaintext to apply Unicode bidirectional algorithm
    return (
      <span
        dir="auto"
        style={{
          unicodeBidi: 'plaintext',
          textAlign: 'start',
        }}
      >
        {textContent}
      </span>
    );
  }, [textContent, children]);

  return (
    <span
      className={cn(className)}
      style={{
        textAlign: 'start',
      }}
    >
      {processedContent}
    </span>
  );
};

export default BidirectionalText;

