import OptimizedImage from '@/components/ui/OptimizedImage';
import { cn } from '@/lib/utils';

const LOGO_SRC = '/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png';

interface AppLogoProps {
  className?: string;
}

/**
 * Circular logo for app header (non-login pages).
 * 40px–44px circle, matches Strategic Plan 2026 button background, white logo centered.
 */
export function AppLogo({ className }: AppLogoProps) {
  return (
    <div
      className={cn(
        'w-11 h-11 shrink-0 rounded-full flex items-center justify-center p-0.5',
        'bg-primary',
        className
      )}
    >
      <OptimizedImage
        src={LOGO_SRC}
        alt="Logo"
        className="w-full h-full object-contain brightness-0 invert"
        sizes="44px"
      />
    </div>
  );
}
