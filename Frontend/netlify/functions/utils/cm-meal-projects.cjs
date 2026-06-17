/**
 * CM & MEAL KPI project codes — keep in sync with Frontend/src/config/cmMealProjects.ts
 */

const CM_MEAL_PROJECT_CODES = [
  'sectors',
  'emergencies',
  'project_evaluation',
  'community_mapping',
  'sawa',
  'frontex',
];

const CM_MEAL_PROJECT_LABELS = {
  sectors: 'القطاعات',
  emergencies: 'الطوارئ',
  project_evaluation: 'تقييم تدخلات المشاريع',
  community_mapping: 'Community Mapping',
  sawa: 'Sawa',
  frontex: 'Frontex',
};

const ROLE_CM_MEAL_PROJECT = 'cm-meal-project';
const DELIM = '||';

function isCmMealProjectCode(v) {
  return CM_MEAL_PROJECT_CODES.includes(String(v).trim().toLowerCase());
}

function parseCmMealProjectsPipe(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw)
    .split(DELIM)
    .map((s) => s.trim().toLowerCase())
    .filter(isCmMealProjectCode);
}

function toCmMealProjectsPipe(codes) {
  if (!Array.isArray(codes)) return '';
  const seen = new Set();
  const out = [];
  for (const c of codes) {
    const x = String(c).trim().toLowerCase();
    if (!isCmMealProjectCode(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out.join(DELIM);
}

function validateCmMealProjectCode(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!isCmMealProjectCode(c)) {
    const err = new Error(`Invalid project. Must be one of: ${CM_MEAL_PROJECT_CODES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return c;
}

function normalizeCmMealProjectsInput(body) {
  if (body.cm_meal_projects !== undefined) {
    if (body.cm_meal_projects === null) return { value: null };
    if (typeof body.cm_meal_projects === 'string') {
      const pipe = toCmMealProjectsPipe(parseCmMealProjectsPipe(body.cm_meal_projects));
      return { value: pipe || null };
    }
    if (!Array.isArray(body.cm_meal_projects)) {
      return { error: 'cm_meal_projects must be an array of project codes' };
    }
    const pipe = toCmMealProjectsPipe(body.cm_meal_projects);
    if (!pipe) return { value: null };
    if (body.cm_meal_projects.length !== parseCmMealProjectsPipe(pipe).length) {
      return { error: `Invalid project code. Use: ${CM_MEAL_PROJECT_CODES.join(', ')}` };
    }
    return { value: pipe };
  }
  if (body.cm_meal_project !== undefined) {
    if (body.cm_meal_project === null || String(body.cm_meal_project).trim() === '') {
      return { value: null };
    }
    const pipe = toCmMealProjectsPipe(parseCmMealProjectsPipe(body.cm_meal_project));
    if (!pipe) return { error: 'Invalid cm_meal_project' };
    return { value: pipe };
  }
  return { skip: true };
}

function userCmMealProjects(user) {
  const raw =
    user?.cm_meal_projects ??
    user?.cmMealProjects ??
    user?.CM_MEAL_PROJECTS;
  return parseCmMealProjectsPipe(raw);
}

function isCmMealProjectRole(role) {
  return String(role ?? '').trim().toLowerCase() === ROLE_CM_MEAL_PROJECT;
}

function isCmMealAdminLike(role) {
  const r = String(role ?? '').trim();
  return r === 'CEO' || r === 'Admin' || r === 'M&E';
}

module.exports = {
  CM_MEAL_PROJECT_CODES,
  CM_MEAL_PROJECT_LABELS,
  ROLE_CM_MEAL_PROJECT,
  DELIM,
  isCmMealProjectCode,
  parseCmMealProjectsPipe,
  toCmMealProjectsPipe,
  validateCmMealProjectCode,
  normalizeCmMealProjectsInput,
  userCmMealProjects,
  isCmMealProjectRole,
  isCmMealAdminLike,
};
