/**
 * CM & MEAL user KPI access — keep in sync with Frontend/src/config/cmMealUserKpiAccess.ts
 */

const { isMealRole } = require('./meal-access.cjs');

const ROLE_CM_MEAL_EMPLOYEE = 'cm-meal-employee';
const ROLE_CM_MEAL_MANAGER = 'cm-meal-manager';

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function isCmMealEmployeeRole(role) {
  return normalizeRole(role) === ROLE_CM_MEAL_EMPLOYEE;
}

function isCmMealManagerRole(role) {
  return normalizeRole(role) === ROLE_CM_MEAL_MANAGER;
}

function isCmMealUserKpiAdminLike(role) {
  return isMealRole(role);
}

function userIdFromUser(user) {
  const id = user?.userId ?? user?.id ?? user?.user_id;
  const n = parseInt(String(id ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = {
  ROLE_CM_MEAL_EMPLOYEE,
  ROLE_CM_MEAL_MANAGER,
  isCmMealEmployeeRole,
  isCmMealManagerRole,
  isCmMealUserKpiAdminLike,
  userIdFromUser,
};
