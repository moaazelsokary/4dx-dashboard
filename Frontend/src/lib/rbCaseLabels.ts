import { normStr } from '@/services/beneficiariesService';

/** res_case.state — e.g. potential_case */
export function formatCaseStatusLabel(status: string | null | undefined): string {
  const v = normStr(status);
  return v ? `Case Status : ${v}` : '';
}

/** res_case.on_going — boolean or legacy text */
export function formatFollowUpStatusLabel(onGoing: string | null | undefined): string {
  const raw = String(onGoing ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'true' || raw === '1' || raw === 't' || raw === 'yes') {
    return 'Follow up Status : open case';
  }
  if (raw === 'false' || raw === '0' || raw === 'f' || raw === 'no') {
    return 'Follow up Status : closed case';
  }
  if (raw.includes('open')) return 'Follow up Status : open case';
  if (raw.includes('clos')) return 'Follow up Status : closed case';
  return `Follow up Status : ${onGoing}`;
}

/** Middle column: always from the Case row (form type + nationality). */
export function searchResultContextLines(
  formType: string | null | undefined,
  nationality: string | null | undefined
): string[] {
  const lines: string[] = [];
  const ft = normStr(formType);
  const nat = normStr(nationality);
  if (ft) lines.push(`Form : ${ft}`);
  if (nat) lines.push(`Nationality : ${nat}`);
  return lines.length ? lines : ['—'];
}
