import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Toggles light / dark. Renders a stable placeholder until mounted to avoid hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-all duration-200 hover:bg-primary/10 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-500" aria-hidden />
      ) : (
        <Moon className="h-4 w-4 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
