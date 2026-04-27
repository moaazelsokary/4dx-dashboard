import { useState } from 'react';
import { Menu } from 'lucide-react';
import { HeaderUserSection } from '@/components/shared/HeaderUserSection';
import SidebarNav from '@/components/shared/SidebarNav';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { User } from '@/services/authService';
import { cn } from '@/lib/utils';
import { SkipLink } from '@/components/ui/skip-link';

export interface AppLayoutProps {
  user: User | null;
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  /** Optional content before the logo (e.g. Back button) */
  headerLeft?: React.ReactNode;
  onSignOut?: () => void;
  onRefresh?: () => void;
  exportSlot?: React.ReactNode;
  status?: 'loading' | { type: 'error'; message: string } | null;
  badge?: React.ReactNode;
  /** Mobile buttons (e.g. Refresh, Sign Out) - shown below header on small screens */
  mobileActions?: React.ReactNode;
  className?: string;
}

export function AppLayout({
  user,
  children,
  headerTitle,
  headerSubtitle,
  headerLeft,
  onSignOut,
  onRefresh,
  exportSlot,
  status,
  badge,
  mobileActions,
  className,
}: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className={cn('min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 flex', className)}>
      <SkipLink />
      {/* Desktop sidebar - full height from top of page */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 border-r bg-card/50 group/sidebar',
          'h-screen sticky top-0',
          /* No width transition: animating width reflows the whole flex row (heavy on large tables). Snap is instant & cheap. */
          'w-12 hover:w-56 overflow-hidden'
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SidebarNav user={user} title={headerTitle} subtitle={headerSubtitle} className="min-h-0 flex-1" />
        </div>
      </aside>

      {/* Right side: header + content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Header - only over content area */}
        <header className="border-b bg-card sticky top-0 z-50 shrink-0 shadow-sm">
          <div className="container mx-auto px-3 sm:px-4 py-2">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {headerLeft}
                {/* Mobile: hamburger to open nav */}
                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden shrink-0 h-11 w-11"
                      aria-label="Open navigation menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="flex h-full max-h-full w-56 min-h-0 flex-col overflow-hidden p-0 pt-12"
                  >
                    <SidebarNav
                      user={user}
                      expanded
                      title={headerTitle}
                      subtitle={headerSubtitle}
                      className="min-h-0 flex-1 px-3 py-4"
                    />
                  </SheetContent>
                </Sheet>
                {/* Mobile: show title in header when sidebar closed */}
                {headerTitle && (
                  <div className="min-w-0 md:hidden">
                    <h1 className="text-sm sm:text-base font-bold text-foreground truncate leading-relaxed">{headerTitle}</h1>
                    {headerSubtitle && <p className="text-xs text-muted-foreground truncate leading-relaxed">{headerSubtitle}</p>}
                  </div>
                )}
              </div>
              <HeaderUserSection
                user={user}
                onSignOut={onSignOut ?? (() => {})}
                onRefresh={onRefresh}
                exportSlot={exportSlot}
                status={status}
                badge={badge}
              />
            </div>
          </div>
        </header>

        {/* Mobile actions row */}
        {mobileActions && <div className="md:hidden border-b bg-card/50 px-3 sm:px-4 py-2.5 shrink-0">{mobileActions}</div>}

        {/* Main content */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0">
          <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-4 pb-20 md:pb-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
