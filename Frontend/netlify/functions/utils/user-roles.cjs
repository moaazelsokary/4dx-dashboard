/**
 * App role helpers — keep in sync with Frontend/src/config/userRoles.ts
 */

const ROLE_DEPARTMENT_TOPIC = 'department-topic';

function normalizeUserRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function isTopicRole(role) {
  return normalizeUserRole(role) === 'topic';
}

function isDepartmentRole(role) {
  return normalizeUserRole(role) === 'department';
}

function isDepartmentTopicRole(role) {
  return normalizeUserRole(role) === ROLE_DEPARTMENT_TOPIC;
}

function isTopicLikeRole(role) {
  const r = normalizeUserRole(role);
  return r === 'topic' || r === ROLE_DEPARTMENT_TOPIC;
}

function isDepartmentLikeRole(role) {
  const r = normalizeUserRole(role);
  return r === 'department' || r === ROLE_DEPARTMENT_TOPIC;
}

function roleRequiresEditableTopics(role) {
  return isTopicLikeRole(role);
}

function roleRequiresDepartment(role) {
  return isDepartmentLikeRole(role);
}

function isCmMealProjectRole(role) {
  return normalizeUserRole(role) === 'cm-meal-project';
}

function isCmMealEmployeeRole(role) {
  return normalizeUserRole(role) === 'cm-meal-employee';
}

function isCmMealManagerRole(role) {
  return normalizeUserRole(role) === 'cm-meal-manager';
}

function roleRequiresCmMealProjects(role) {
  return isCmMealProjectRole(role) || isCmMealManagerRole(role);
}

function roleRequiresCmMealProjectsMandatory(role) {
  return isCmMealProjectRole(role);
}

function roleRequiresCmMealManagedEmployees(role) {
  return isCmMealManagerRole(role);
}

module.exports = {
  ROLE_DEPARTMENT_TOPIC,
  normalizeUserRole,
  isTopicRole,
  isDepartmentRole,
  isDepartmentTopicRole,
  isTopicLikeRole,
  isDepartmentLikeRole,
  roleRequiresEditableTopics,
  roleRequiresDepartment,
  isCmMealProjectRole,
  isCmMealEmployeeRole,
  isCmMealManagerRole,
  roleRequiresCmMealProjects,
  roleRequiresCmMealProjectsMandatory,
  roleRequiresCmMealManagedEmployees,
};
