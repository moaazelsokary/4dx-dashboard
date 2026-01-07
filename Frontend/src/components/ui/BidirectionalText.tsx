import { ReactNode, useMemo } from 'react';
import { containsArabic, containsEnglish } from '@/utils/textDirection';
import { cn } from '@/lib/utils';

interface BidirectionalTextProps {
  children: ReactNode;
  className?: string;
}

/**
 * Check if a character is Arabic
 */
const isArabicChar = (char: string): boolean => {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char);
};

/**
 * Check if a character is English/Latin
 */
const isEnglishChar = (char: string): boolean => {
  return /[a-zA-Z]/.test(char);
};

/**
 * Check if a character is a number
 */
const isNumberChar = (char: string): boolean => {
  return /\d/.test(char);
};

/**
 * Check if a character is a currency or percentage symbol
 */
const isCurrencyOrPercent = (char: string): boolean => {
  return /[$€£¥₹%]/.test(char);
};

/**
 * Component for rendering mixed Arabic/English/Numbers/Symbols text with proper bidirectional support
 * Works like Excel - automatically detects and arranges mixed content correctly
 * Handles Arabic, English, numbers, and symbols without reversing or breaking them
 * 
 * Examples:
 * - "خطة Strategy التنفيذية" - Arabic + English
 * - "المرحلة 3 – 2025" - Arabic + Numbers
 * - "الميزانية Budget ($2.5M)" - Arabic + English + Currency
 * - "وفقًا لـ KPI المعتمدة" - Arabic sentence with English acronym
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

    // For mixed content, we need to segment the text intelligently
    // Split into segments: Arabic blocks, English blocks, numbers, symbols
    const segments: Array<{ text: string; type: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral' }> = [];
    let currentSegment = '';
    let currentType: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral' | null = null;

    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      let charType: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral';

      if (isArabicChar(char)) {
        charType = 'arabic';
      } else if (isEnglishChar(char)) {
        charType = 'english';
      } else if (isNumberChar(char)) {
        charType = 'number';
      } else if (isCurrencyOrPercent(char)) {
        charType = 'symbol';
      } else {
        charType = 'neutral'; // spaces, punctuation, etc.
      }

      // If this is the first character or same type as current segment, add to current segment
      if (currentType === null || charType === currentType || charType === 'neutral') {
        currentSegment += char;
        if (charType !== 'neutral') {
          currentType = charType;
        }
      } else {
        // Different type - save current segment and start new one
        if (currentSegment.trim() && currentType) {
          segments.push({ text: currentSegment, type: currentType });
        }
        currentSegment = char;
        currentType = charType === 'neutral' ? null : charType;
      }
    }

    // Add last segment
    if (currentSegment && currentType) {
      segments.push({ text: currentSegment, type: currentType });
    } else if (currentSegment.trim()) {
      // Handle trailing neutral characters
      segments.push({ text: currentSegment, type: 'neutral' });
    }

    // If we couldn't segment properly, fall back to simple approach
    if (segments.length === 0) {
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
    }

    // Determine base direction from first strong character
    const firstStrongSegment = segments.find(s => s.type !== 'neutral');
    const baseDir = firstStrongSegment?.type === 'arabic' ? 'rtl' : 'ltr';

    // Render segments with proper direction and Unicode isolation
    // Use Unicode bidirectional isolation marks to ensure proper ordering
    return (
      <span
        dir={baseDir}
        style={{
          unicodeBidi: 'isolate',
          textAlign: 'start',
        }}
      >
        {segments.map((segment, idx) => {
          if (segment.type === 'neutral') {
            return <span key={idx}>{segment.text}</span>;
          }

          // Determine direction for this segment
          const segmentDir = segment.type === 'arabic' ? 'rtl' : 'ltr';
          
          // Add Unicode bidirectional isolation marks
          // \u2066 = LTR isolate, \u2067 = RTL isolate, \u2069 = pop directional isolate
          const isolatedText = segment.type === 'arabic'
            ? `\u2067${segment.text}\u2069` // RTL isolate
            : `\u2066${segment.text}\u2069`; // LTR isolate

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

