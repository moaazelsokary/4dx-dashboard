import { ReactNode } from 'react';
import { containsArabic, containsEnglish } from '@/utils/textDirection';
import { cn } from '@/lib/utils';

interface BidirectionalTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Component for rendering mixed Arabic/English text with proper bidirectional support
 * Automatically detects and arranges mixed content correctly
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

  if (!textContent) {
    return <span className={cn(className)}>{children}</span>;
  }

  // Check if text contains both Arabic and English
  const hasArabic = containsArabic(textContent);
  const hasEnglish = containsEnglish(textContent);
  const isMixed = hasArabic && hasEnglish;

  // For mixed content, split into segments and wrap each with proper direction
  if (isMixed) {
    // Split text into segments (Arabic vs non-Arabic)
    const segments: Array<{ text: string; isArabic: boolean }> = [];
    let currentSegment = '';
    let currentIsArabic = false;
    
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      const charIsArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char);
      
      if (i === 0) {
        currentIsArabic = charIsArabic;
        currentSegment = char;
      } else if (charIsArabic === currentIsArabic || char === ' ') {
        // Include spaces in current segment
        currentSegment += char;
      } else {
        // Segment boundary - save current and start new
        if (currentSegment.trim()) {
          segments.push({ text: currentSegment, isArabic: currentIsArabic });
        }
        currentSegment = char;
        currentIsArabic = charIsArabic;
      }
    }
    
    // Add last segment
    if (currentSegment.trim()) {
      segments.push({ text: currentSegment, isArabic: currentIsArabic });
    }

    // If we have segments, render them with proper direction
    if (segments.length > 0) {
      return (
        <span
          className={cn(className)}
          dir="auto"
          style={{
            unicodeBidi: 'plaintext',
            textAlign: 'start',
          }}
        >
          {segments.map((segment, idx) => {
            // Determine if segment should be RTL (Arabic) or LTR (English/other)
            const segmentDir = segment.isArabic ? 'rtl' : 'ltr';
            return (
              <span
                key={idx}
                dir={segmentDir}
                style={{
                  unicodeBidi: 'embed',
                  display: 'inline',
                }}
              >
                {segment.text}
              </span>
            );
          })}
        </span>
      );
    }
  }

  // For non-mixed content, use simple direction detection
  const dir = hasArabic ? 'rtl' : 'ltr';

  return (
    <span
      className={cn(className)}
      dir={dir}
      style={{
        textAlign: 'start',
      }}
    >
      {children}
    </span>
  );
};

export default BidirectionalText;

