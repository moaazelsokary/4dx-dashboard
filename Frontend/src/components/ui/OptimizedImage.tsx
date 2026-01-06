import { useState, useEffect, ImgHTMLAttributes } from 'react';
import { generateSrcSet, getOptimalImageFormat } from '@/utils/imageOptimization';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  fallback?: string;
  loading?: 'lazy' | 'eager';
  className?: string;
}

const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  fallback,
  loading = 'lazy',
  className,
  ...props
}: OptimizedImageProps) => {
  const [imageFormat, setImageFormat] = useState<'webp' | 'jpeg' | 'png'>('jpeg');
  const [error, setError] = useState(false);

  useEffect(() => {
    getOptimalImageFormat().then(setImageFormat);
  }, []);

  // Generate srcset for responsive images
  const srcSet = generateSrcSet(src, [320, 640, 768, 1024, 1280, 1920]);

  const handleError = () => {
    setError(true);
  };

  // Use fallback if error or provided
  const imageSrc = error && fallback ? fallback : src;

  return (
    <img
      src={imageSrc}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      onError={handleError}
      className={cn('object-cover', className)}
      {...props}
    />
  );
};

export default OptimizedImage;

