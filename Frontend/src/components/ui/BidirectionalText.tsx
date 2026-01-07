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

    // Determine base direction from first strong character
    // If starts with Arabic, entire content is RTL
    // If starts with English, entire content is LTR
    let baseDir: 'rtl' | 'ltr' = 'ltr';
    
    // Find first strong character (Arabic or English)
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      if (isArabicChar(char)) {
        baseDir = 'rtl';
        break;
      } else if (isEnglishChar(char)) {
        baseDir = 'ltr';
        break;
      }
    }

    // If no strong character found, check if text contains Arabic
    if (baseDir === 'ltr') {
      const hasArabic = containsArabic(textContent);
      if (hasArabic) {
        baseDir = 'rtl';
      }
    }

    // Use base direction for entire content
    // This ensures if it starts with Arabic, everything is RTL
    // If it starts with English, everything is LTR
    return (
      <span 
        dir={baseDir} 
        style={{ 
          unicodeBidi: 'plaintext',
          textAlign: baseDir === 'rtl' ? 'right' : 'left',
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

