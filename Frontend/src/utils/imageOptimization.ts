/**
 * Image Optimization Utilities
 * Provides functions for generating responsive image srcsets and detecting optimal formats
 */

/**
 * Generate srcset string for responsive images
 * @param src - Base image source URL
 * @param widths - Array of image widths to generate
 * @returns srcset string
 */
export function generateSrcSet(src: string, widths: number[]): string {
  if (!src) return '';
  
  // If src is already a data URL or external URL without query params, return as-is
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return '';
  }

  // For simple cases, just return the original src
  // In a production app, you might want to use an image CDN or service
  // that generates different sizes (e.g., Cloudinary, Imgix, etc.)
  return widths
    .map((width) => `${src} ${width}w`)
    .join(', ');
}

/**
 * Detect optimal image format based on browser support
 * @returns Promise resolving to the best supported format
 */
export async function getOptimalImageFormat(): Promise<'webp' | 'jpeg' | 'png'> {
  // Check WebP support
  if (await supportsWebP()) {
    return 'webp';
  }

  // Check AVIF support (optional, can be added later)
  // if (await supportsAVIF()) {
  //   return 'avif';
  // }

  // Default to JPEG for best compatibility
  return 'jpeg';
}

/**
 * Check if browser supports WebP format
 */
function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src =
      'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
}

/**
 * Check if browser supports AVIF format (optional, for future use)
 */
function supportsAVIF(): Promise<boolean> {
  return new Promise((resolve) => {
    const avif = new Image();
    avif.onload = avif.onerror = () => {
      resolve(avif.height === 2);
    };
    avif.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  });
}

/**
 * Get image dimensions from URL (if needed)
 * @param url - Image URL
 * @returns Promise resolving to width and height
 */
export function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Generate optimized image URL with query parameters
 * Useful for image CDNs that support size/format parameters
 * @param src - Base image URL
 * @param width - Desired width
 * @param format - Image format (webp, jpeg, png)
 * @returns Optimized image URL
 */
export function getOptimizedImageUrl(
  src: string,
  width?: number,
  format?: 'webp' | 'jpeg' | 'png'
): string {
  if (!src) return '';
  
  // If using an image CDN, you would add query parameters here
  // Example: return `${src}?w=${width}&f=${format}&q=80`;
  
  // For now, return the original URL
  // In production, integrate with your image optimization service
  return src;
}

