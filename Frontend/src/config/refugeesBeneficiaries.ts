/** Shareable route for case story only (no analytics dashboard). */
export const REFUGEES_CASE_STORY_PATH = '/main-plan/refugees/case-story';

export function isCaseWorkerRole(role: string | null | undefined): boolean {
  return String(role ?? '')
    .trim()
    .toLowerCase() === 'case worker';
}
