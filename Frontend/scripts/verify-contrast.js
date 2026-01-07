/**
 * Contrast Verification Script
 * Verifies color combinations meet WCAG AA standards
 */

// WCAG AA contrast ratios
const MIN_CONTRAST_NORMAL = 4.5;
const MIN_CONTRAST_LARGE = 3.0;

/**
 * Calculate relative luminance
 */
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(...color1);
  const lum2 = getLuminance(...color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

/**
 * Verify contrast ratio
 */
function verifyContrast(foreground, background, isLargeText = false) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);

  if (!fg || !bg) {
    console.error(`Invalid color: ${foreground} or ${background}`);
    return false;
  }

  const ratio = getContrastRatio(fg, bg);
  const minRatio = isLargeText ? MIN_CONTRAST_LARGE : MIN_CONTRAST_NORMAL;
  const passes = ratio >= minRatio;

  console.log(
    `${foreground} on ${background}: ${ratio.toFixed(2)}:1 ${
      passes ? '✅' : '❌'
    } (min: ${minRatio}:1)`
  );

  return passes;
}

// Test common color combinations
console.log('Testing color contrast ratios...\n');

// Example color pairs from your theme
const colorPairs = [
  { fg: '#000000', bg: '#ffffff', large: false }, // Black on white
  { fg: '#ffffff', bg: '#000000', large: false }, // White on black
  { fg: '#666666', bg: '#ffffff', large: false }, // Gray on white
  { fg: '#000000', bg: '#f0f0f0', large: false }, // Black on light gray
];

let allPass = true;
colorPairs.forEach(({ fg, bg, large }) => {
  if (!verifyContrast(fg, bg, large)) {
    allPass = false;
  }
});

console.log(`\n${allPass ? '✅ All tests passed' : '❌ Some tests failed'}`);

export { verifyContrast, getContrastRatio };

