import { ReactNode, useMemo } from 'react';
import { containsArabic, containsEnglish } from '@/utils/textDirection';
import { cn } from '@/lib/utils';

interface BidirectionalTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Component for rendering mixed Arabic/English text with proper bidirectional support
 * Automatically detects and arranges mixed content correctly
 * Splits text into segments and wraps each with proper direction
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

  // Process text to split into segments and wrap with proper direction
  const processedContent = useMemo(() => {
    if (!textContent) {
      return children;
    }

    const hasArabic = containsArabic(textContent);
    const hasEnglish = containsEnglish(textContent);
    const isMixed = hasArabic && hasEnglish;

    // If not mixed, use simple direction
    if (!isMixed) {
      return (
        <span dir={hasArabic ? 'rtl' : 'ltr'} style={{ unicodeBidi: 'embed' }}>
          {textContent}
        </span>
      );
    }

    // Split text into segments (Arabic vs non-Arabic)
    const segments: Array<{ text: string; isArabic: boolean }> = [];
    let currentSegment = '';
    let currentIsArabic = false;
    let segmentStarted = false;
    
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      // Check if character is Arabic (including extended Arabic ranges)
      const charIsArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char);
      // Check if character is English/Latin
      const charIsEnglish = /[a-zA-Z]/.test(char);
      
      if (!segmentStarted) {
        // Start first segment
        currentIsArabic = charIsArabic;
        currentSegment = char;
        segmentStarted = true;
      } else if (charIsArabic === currentIsArabic || (!charIsArabic && !charIsEnglish)) {
        // Same type or neutral character (space, punctuation) - add to current segment
        currentSegment += char;
      } else {
        // Different type - save current segment and start new one
        if (currentSegment.trim()) {
          segments.push({ text: currentSegment, isArabic: currentIsArabic });
        }
        currentSegment = char;
        currentIsArabic = charIsArabic;
      }
    }
    
    // Add last segment
    if (currentSegment) {
      segments.push({ text: currentSegment, isArabic: currentIsArabic });
    }

    // Render segments with proper direction
    if (segments.length === 0) {
      return textContent;
    }

    // Determine base direction (RTL if starts with Arabic, LTR otherwise)
    const baseDir = segments[0]?.isArabic ? 'rtl' : 'ltr';

    // Use Unicode bidirectional isolation marks to ensure proper ordering
    // This ensures Arabic text flows RTL and English flows LTR correctly
    return (
      <span dir={baseDir} style={{ unicodeBidi: 'isolate' }}>
        {segments.map((segment, idx) => {
          const segmentDir = segment.isArabic ? 'rtl' : 'ltr';
          // Add bidirectional marks to ensure proper ordering
          const isolatedText = segment.isArabic 
            ? `\u2067${segment.text}\u2069` // RTL isolate marks
            : `\u2066${segment.text}\u2069`; // LTR isolate marks
          
          return (
            <span
              key={idx}
              dir={segmentDir}
              style={{
                unicodeBidi: 'embed',
                display: 'inline',
              }}
            >
              {isolatedText}
            </span>
          );
        })}
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

