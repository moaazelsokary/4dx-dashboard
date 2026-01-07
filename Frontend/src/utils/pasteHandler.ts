/**
 * Paste handler utilities for Excel copy-paste events
 * Preserves bidirectional text when pasting from Excel
 */

import { normalizeBidiText } from './bidiUtils';

/**
 * Handle paste event from Excel or other sources
 * Preserves bidirectional text and cleans up unwanted characters
 * @param event - Clipboard event
 * @returns Processed paste data
 */
export const handleExcelPaste = (
  event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
): string => {
  const pastedText = event.clipboardData.getData('text/plain');
  
  // Excel typically pastes with tab-separated values for multiple cells
  // For single cell paste, it's just the text
  // We want to preserve the text as-is but clean up any unwanted direction marks
  
  // Normalize the text to remove unwanted direction marks
  // but preserve the actual content
  const normalized = normalizeBidiText(pastedText);
  
  return normalized;
};

/**
 * Handle paste event and prevent default if needed
 * Useful for custom paste handling in inputs
 * @param event - Clipboard event
 * @param onPaste - Optional callback to handle the paste
 * @returns true if paste was handled, false otherwise
 */
export const handlePasteWithBidi = (
  event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  onPaste?: (text: string) => void
): boolean => {
  const pastedText = handleExcelPaste(event);
  
  if (onPaste) {
    event.preventDefault();
    onPaste(pastedText);
    return true;
  }
  
  // If no custom handler, let the browser handle it naturally
  // The browser's default paste should preserve bidirectional text
  return false;
};

/**
 * Parse Excel paste data (tab-separated values)
 * Useful for pasting multiple cells
 * @param pastedText - Pasted text from Excel
 * @returns Array of rows, each row is an array of cell values
 */
export const parseExcelPaste = (pastedText: string): string[][] => {
  if (!pastedText) return [];
  
  // Excel pastes with \n for rows and \t for columns
  const rows = pastedText.split('\n');
  
  return rows.map(row => {
    // Split by tab and normalize each cell
    return row.split('\t').map(cell => normalizeBidiText(cell));
  });
};

/**
 * Clean up pasted text from Excel
 * Removes unwanted characters while preserving bidirectional text
 * @param text - Pasted text
 * @returns Cleaned text
 */
export const cleanExcelPaste = (text: string): string => {
  if (!text) return '';
  
  // Remove zero-width characters that might interfere
  // but keep the actual content
  return text
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u200C/g, '') // Zero-width non-joiner
    .replace(/\u200D/g, '') // Zero-width joiner
    .replace(/\uFEFF/g, ''); // Zero-width no-break space (BOM)
};

/**
 * Prepare text for pasting into Excel
 * Ensures text will display correctly when pasted back
 * @param text - Text to prepare
 * @returns Text ready for Excel paste
 */
export const prepareForExcelPaste = (text: string): string => {
  if (!text) return '';
  
  // Excel handles bidirectional text automatically
  // We just need to ensure the text is clean
  return normalizeBidiText(text);
};

