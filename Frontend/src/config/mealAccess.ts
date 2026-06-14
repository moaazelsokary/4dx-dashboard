import type { User } from '@/services/authService';

export const MEAL_PATH = '/meal';

export function isMealRole(role: string | undefined | null): boolean {
  const r = String(role ?? '').trim();
  return r === 'CEO' || r === 'Admin' || r === 'M&E';
}

export function canManageMealContent(user: User | null | undefined): boolean {
  return isMealRole(user?.role);
}

export function canAccessMeal(user: User | null | undefined): boolean {
  if (!user) return false;
  const routes = user.allowedRoutes;
  if (routes != null && Array.isArray(routes) && routes.some((p) => String(p).split('?')[0] === MEAL_PATH)) {
    return true;
  }
  return isMealRole(user.role);
}
