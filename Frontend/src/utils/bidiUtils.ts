/**
 * Bidirectional text utilities
 * Provides functions for working with mixed Arabic/English text
 * including sorting, searching, and normalization
 */

import { containsArabic, containsEnglish, getDominantDirection } from './textDirection';

/**
 * Normalize bidirectional text for storage
 * Removes unwanted direction marks while preserving text content
 * @param text - Text to normalize
 * @returns Normalized text
 */
export const normalizeBidiText = (text: string): string => {
  if (!text) return '';
  
  // Remove Unicode bidirectional isolation marks that might interfere
  // Keep the text content but remove explicit direction marks
  // \u2066 = LTR isolate, \u2067 = RTL isolate, \u2069 = pop directional isolate
  return text
    .replace(/\u2066/g, '') // Remove LTR isolate
    .replace(/\u2067/g, '') // Remove RTL isolate
    .replace(/\u2069/g, ''); // Remove pop directional isolate
};

/**
 * Sort data considering bidirectional text
 * Handles mixed Arabic/English content correctly
 * @param data - Array of objects to sort
 * @param key - Key to sort by
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Sorted array
 */
export const sortBidiAware = <T extends Record<string, any>>(
  data: T[],
  key: string,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  if (!data || data.length === 0) return data;
  
  const sorted = [...data].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    
    // Handle null/undefined
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    
    // Convert to strings for comparison
    const aStr = String(aValue);
    const bStr = String(bValue);
    
    // Use localeCompare for proper bidirectional-aware sorting
    // This handles Arabic, English, and mixed content correctly
    const comparison = aStr.localeCompare(bStr, undefined, {
      numeric: true, // Handle numbers correctly
      sensitivity: 'base', // Case-insensitive
    });
    
    return direction === 'asc' ? comparison : -comparison;
  });
  
  return sorted;
};

/**
 * Search in bidirectional text
 * Works for Arabic words inside mixed text, English words inside Arabic text, etc.
 * @param text - Text to search in
 * @param query - Search query
 * @returns true if query is found in text
 */
export const searchBidiAware = (text: string, query: string): boolean => {
  if (!text || !query) return false;
  
  // Normalize both text and query for comparison
  const normalizedText = normalizeBidiText(text.toLowerCase());
  const normalizedQuery = normalizeBidiText(query.toLowerCase());
  
  // Simple substring search (case-insensitive)
  // For more advanced search, consider using a library like Fuse.js
  return normalizedText.includes(normalizedQuery);
};

/**
 * Extract searchable text from bidirectional content
 * Removes direction marks and normalizes for searching
 * @param text - Text to extract searchable content from
 * @returns Searchable text
 */
export const extractSearchableText = (text: string): string => {
  if (!text) return '';
  
  // Normalize and remove direction marks
  return normalizeBidiText(text).trim();
};

/**
 * Preserve bidirectional text on copy
 * Ensures copied text maintains proper direction
 * @param text - Text to prepare for copying
 * @returns Text ready for clipboard
 */
export const preserveBidiOnCopy = (text: string): string => {
  if (!text) return '';
  
  // For clipboard, we want to preserve the text as-is
  // The browser will handle bidirectional text in the clipboard
  // We just need to ensure no unwanted direction marks are added
  return normalizeBidiText(text);
};

/**
 * Get text segments for display
 * Splits text into logical segments (Arabic, English, numbers, symbols)
 * @param text - Text to segment
 * @returns Array of text segments with their types
 */
export const getTextSegments = (
  text: string
): Array<{ text: string; type: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral' }> => {
  if (!text) return [];
  
  const segments: Array<{ text: string; type: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral' }> = [];
  let currentSegment = '';
  let currentType: 'arabic' | 'english' | 'number' | 'symbol' | 'neutral' | null = null;
  
  const isArabicChar = (char: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char);
  const isEnglishChar = (char: string) => /[a-zA-Z]/.test(char);
  const isNumberChar = (char: string) => /\d/.test(char);
  const isCurrencyOrPercent = (char: string) => /[$€£¥₹%]/.test(char);
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
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
      charType = 'neutral';
    }
    
    if (currentType === null || charType === currentType || charType === 'neutral') {
      currentSegment += char;
      if (charType !== 'neutral') {
        currentType = charType;
      }
    } else {
      if (currentSegment.trim() && currentType) {
        segments.push({ text: currentSegment, type: currentType });
      }
      currentSegment = char;
      currentType = charType === 'neutral' ? null : charType;
    }
  }
  
  if (currentSegment && currentType) {
    segments.push({ text: currentSegment, type: currentType });
  } else if (currentSegment.trim()) {
    segments.push({ text: currentSegment, type: 'neutral' });
  }
  
  return segments;
};

/**
 * Check if text is primarily Arabic or English
 * Useful for determining default direction
 * @param text - Text to check
 * @returns 'rtl' if primarily Arabic, 'ltr' if primarily English or mixed
 */
export const getTextBaseDirection = (text: string): 'rtl' | 'ltr' => {
  return getDominantDirection(text);
};

