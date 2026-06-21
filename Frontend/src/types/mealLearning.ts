import { STRATEGIC_TOPIC_CODES, STRATEGIC_TOPIC_LABELS } from '@/config/strategicTopics';

export type MealLearningPointStatus = 'completed' | 'on_hold' | 'pending';

export type MealLearningActivityLinkType =
  | 'strategic_topic_kpi'
  | 'department_objective'
  | 'strategic_department_objective';

export interface MealLearningActivityLink {
  id?: number;
  link_type: MealLearningActivityLinkType;
  linked_id: number;
  activity_label?: string | null;
  source_label?: string | null;
  kpi_label?: string | null;
}

export interface MealLearningPoint {
  id: number;
  learning_point: string;
  corrective_action: string | null;
  status: MealLearningPointStatus;
  end_date: string | null;
  department_code: string | null;
  department_codes?: string[];
  attachment_url: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  has_attachment_file?: boolean;
  sort_order: number;
  activity_links: MealLearningActivityLink[];
  created_at?: string;
  updated_at?: string;
  created_by_username?: string | null;
  updated_by_username?: string | null;
}

export const MEAL_LEARNING_STATUS_OPTIONS: { value: MealLearningPointStatus; label: string }[] = [
  { value: 'pending', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
];

export function mealLearningStatusLabel(status: MealLearningPointStatus | string): string {
  return MEAL_LEARNING_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? String(status);
}

export function activityLinkDisplayText(link: MealLearningActivityLink): string {
  return (link.activity_label || `ID ${link.linked_id}`).trim();
}

function topicLabelFromSource(source: string): string {
  const raw = source.trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const code = STRATEGIC_TOPIC_CODES.find(
    (c) => c === lower || STRATEGIC_TOPIC_LABELS[c].toLowerCase() === lower
  );
  return code ? STRATEGIC_TOPIC_LABELS[code] : raw;
}

/** Distinct strategic topics from linked activities (display labels). */
export function formatTopicsFromLinks(links: MealLearningActivityLink[]): string {
  const topics = new Set<string>();
  for (const l of links || []) {
    if (l.link_type === 'strategic_topic_kpi' && l.source_label?.trim()) {
      topics.add(topicLabelFromSource(l.source_label));
    }
  }
  if (!topics.size) return '—';
  return [...topics].sort((a, b) => a.localeCompare(b)).join('\n');
}

/** Distinct department codes from linked activities (legacy display helper). */
export function formatDepartmentsFromLinks(links: MealLearningActivityLink[]): string {
  const depts = new Set<string>();
  for (const l of links || []) {
    if (
      (l.link_type === 'department_objective' || l.link_type === 'strategic_department_objective') &&
      l.source_label?.trim()
    ) {
      depts.add(l.source_label.trim());
    }
  }
  if (!depts.size) return '—';
  return [...depts].sort((a, b) => a.localeCompare(b)).join('\n');
}

export function formatLearningPointDepartment(
  row: MealLearningPoint,
  nameByCode?: Map<string, string> | Record<string, string>
): string {
  const codes = row.department_codes?.length
    ? row.department_codes
    : row.department_code
      ? [row.department_code]
      : [];
  if (!codes.length) return '—';

  const lookup = (code: string): string => {
    if (!nameByCode) return code;
    if (nameByCode instanceof Map) {
      return nameByCode.get(code) ?? nameByCode.get(code.toLowerCase()) ?? code;
    }
    return nameByCode[code] ?? nameByCode[code.toLowerCase()] ?? code;
  };

  return [...new Set(codes.map(lookup))]
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

export function learningPointHasAttachment(row: MealLearningPoint): boolean {
  return Boolean(row.attachment_url?.trim() || row.has_attachment_file);
}

export function formatLearningPointAttachment(row: MealLearningPoint): string {
  if (row.attachment_url?.trim()) return 'URL';
  if (row.has_attachment_file) return row.attachment_file_name?.trim() || 'File';
  return '—';
}

/** Table / filter display: always numbered from 1. */
export function formatActivityLinksSummary(links: MealLearningActivityLink[]): string {
  if (!links?.length) return '—';
  return links.map((l, i) => `${i + 1}- ${activityLinkDisplayText(l)}`).join('\n');
}
