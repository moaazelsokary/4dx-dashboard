/**
 * Text direction detection utilities
 * Handles detection of Arabic vs English text for bidirectional text support
 */

/**
 * Check if a string contains Arabic characters
 */
export const containsArabic = (text: string): boolean => {
  if (!text) return false;
  // Arabic Unicode range: \u0600-\u06FF
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
};

/**
 * Check if a string contains English/Latin characters
 */
export const containsEnglish = (text: string): boolean => {
  if (!text) return false;
  // Latin/English Unicode range: \u0000-\u007F and extended
  const englishRegex = /[a-zA-Z]/;
  return englishRegex.test(text);
};

/**
 * Detect if text is primarily Arabic or English
 * Returns 'rtl' for Arabic, 'ltr' for English, 'auto' for mixed
 */
export const detectTextDirection = (text: string): 'rtl' | 'ltr' | 'auto' => {
  if (!text) return 'ltr';
  
  const hasArabic = containsArabic(text);
  const hasEnglish = containsEnglish(text);
  
  if (hasArabic && hasEnglish) {
    return 'auto'; // Mixed content - let browser decide
  }
  
  if (hasArabic) {
    return 'rtl';
  }
  
  return 'ltr';
};

/**
 * Get the dominant direction of text
 */
export const getDominantDirection = (text: string): 'rtl' | 'ltr' => {
  if (!text) return 'ltr';
  
  const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
  
  return arabicCount > englishCount ? 'rtl' : 'ltr';
};

