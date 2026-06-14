/**
 * CM & MEAL KPI project pillars — keep in sync with netlify/functions/utils/cm-meal-projects.cjs
 */

export const CM_MEAL_PROJECT_CODES = [
  'sectors',
  'emergencies',
  'project_evaluation',
  'community_mapping',
  'sawa',
  'frontex',
] as const;

export type CmMealProjectCode = (typeof CM_MEAL_PROJECT_CODES)[number];

export const CM_MEAL_PROJECT_LABELS: Record<CmMealProjectCode, string> = {
  sectors: 'القطاعات',
  emergencies: 'الطوارئ',
  project_evaluation: 'تقييم تدخلات المشاريع',
  community_mapping: 'Community Mapping',
  sawa: 'Sawa',
  frontex: 'Frontex',
};

export const ROLE_CM_MEAL_PROJECT = 'cm-meal-project' as const;
export const ROLE_CM_MEAL_PROJECT_LABEL = 'CM & MEAL (by project)';

export function isCmMealProjectCode(v: string): v is CmMealProjectCode {
  return (CM_MEAL_PROJECT_CODES as readonly string[]).includes(v);
}

export function parseCmMealProjectsPipe(raw: string | null | undefined): CmMealProjectCode[] {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split('||')
    .map((s) => s.trim().toLowerCase())
    .filter((c): c is CmMealProjectCode => isCmMealProjectCode(c));
}

export function toCmMealProjectsPipe(codes: CmMealProjectCode[]): string {
  return [...new Set(codes.map((c) => c.trim().toLowerCase()))]
    .filter((c) => isCmMealProjectCode(c))
    .join('||');
}
