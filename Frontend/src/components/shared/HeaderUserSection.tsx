import { LogOut, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User } from '@/services/authService';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

const AVATAR_PATHS = {
  hairWoman: '/Hair Woman Avatar.png',  // Life community
  woman: '/Woman Avatar.png',           // case, communication, hr
  man: '/Man Avatar.png',               // others
} as const;

function getAvatarForUser(user: { departments?: string[]; role?: string }): string {
  const depts = (user.departments || []).map((d) => d.toLowerCase());
  // Hair Woman: Life community
  if (depts.includes('community')) return AVATAR_PATHS.hairWoman;
  // Woman: case, communication, hr
  if (depts.some((d) => ['case', 'communication', 'hr'].includes(d))) return AVATAR_PATHS.woman;
  // Man: others (it, operations, dfr, bdm, security, admin, procurement, offices, etc.)
  return AVATAR_PATHS.man;
}

function getInitials(username: string): string {
  const parts = username.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

function formatDisplayName(username: string): string {
  return username
    .split(/[\s._-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

interface HeaderUserSectionProps {
  user: User | null;
  onSignOut: () => void;
  onRefresh?: () => void;
  /** Export icon (ExportButton with asIcon) - shown like Refresh/Sign Out */
  exportSlot?: React.ReactNode;
  /** Optional status: loading or error message */
  status?: 'loading' | { type: 'error'; message: string } | null;
  /** Optional Badge to show (e.g. CEO View, Department) */
  badge?: React.ReactNode;
  className?: string;
}

export function HeaderUserSection({
  user,
  onSignOut,
  onRefresh,
  exportSlot,
  status,
  badge,
  className,
}: HeaderUserSectionProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 sm:gap-5',
        className
      )}
    >
      {/* Badge (CEO View / Department) - when provided */}
      {badge}

      {/* Status (loading/error) - desktop */}
      {status && (
        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
          {status === 'loading' && (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing...
            </>
          )}
          {status && typeof status === 'object' && status.type === 'error' && (
            <span className="text-destructive">{status.message}</span>
          )}
        </div>
      )}

      <ThemeToggle />

      {/* Export icon */}
      {exportSlot}

      {/* When not signed in: show Sign in */}
      {!user && (
        <a
          href="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          Sign in
        </a>
      )}

      {/* When signed in: Refresh, Sign Out, avatar */}
      {user && (
        <>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center justify-center shrink-0 h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-1 rounded-full bg-card border border-border shadow-sm transition-all duration-200 hover:bg-primary/10 hover:border-primary/30 hover:shadow-md"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center shrink-0 h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-1 rounded-full bg-card border border-border shadow-sm transition-all duration-200 hover:bg-primary/10 hover:border-primary/30 hover:shadow-md"
            aria-label="Sign Out"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
              <AvatarImage
                src={getAvatarForUser(user)}
                alt={user.username}
              />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {getInitials(user.username)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground hidden md:block text-left truncate">
              {formatDisplayName(user.username)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
