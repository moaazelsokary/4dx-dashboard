/**
 * MEAL section access — CEO, Admin, M&E role, or explicit /meal in allowedRoutes.
 */

const MEAL_PATH = '/meal';

function normalizeRole(role) {
  return String(role ?? '').trim();
}

function isMealRole(role) {
  const r = normalizeRole(role);
  return r === 'CEO' || r === 'Admin' || r === 'M&E';
}

function hasExplicitMealRoute(user) {
  const routes = user?.allowedRoutes;
  if (!Array.isArray(routes)) return false;
  return routes.some((p) => String(p).split('?')[0] === MEAL_PATH);
}

function canAccessMeal(user) {
  if (!user) return false;
  if (hasExplicitMealRoute(user)) return true;
  return isMealRole(user.role);
}

module.exports = {
  MEAL_PATH,
  isMealRole,
  canAccessMeal,
};
