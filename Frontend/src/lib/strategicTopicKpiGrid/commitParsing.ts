import type { StrategicTopicKpiRow, StrategicTopicKpiStatus } from '@/types/wig';
import { STRATEGIC_TOPIC_STATUSES } from '@/pages/strategic-topics/strategicTopicKpiUtils';
import type { StTopicGridColumn } from './types';

export type StTopicCommitResult =
  | {
      ok: true;
      patch: Partial<
        Omit<StrategicTopicKpiRow, 'id' | 'created_at' | 'updated_at' | 'main_kpi' | 'main_objective' | 'main_pillar'>
      >;
    }
  | { ok: false; error: string };

function invalidIsoDate(): StTopicCommitResult {
  return { ok: false, error: 'Use date format YYYY-MM-DD.' };
}

export function parseStTopicInlineCommit(column: StTopicGridColumn, raw: string): StTopicCommitResult {
  switch (column) {
    case 'objective':
      return { ok: true, patch: { objective_text: raw.trim() || null } };
    case 'activity': {
      const v = raw.trim();
      if (!v) return { ok: false, error: 'Activity cannot be empty.' };
      return { ok: true, patch: { activity: v } };
    }
    case 'duration':
      return { ok: true, patch: { expected_duration: raw.trim() || null } };
    case 'start': {
      const t = raw.trim();
      if (!t) return { ok: true, patch: { start_date: null } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.slice(0, 10))) return invalidIsoDate();
      return { ok: true, patch: { start_date: t.slice(0, 10) } };
    }
    case 'end': {
      const t = raw.trim();
      if (!t) return { ok: true, patch: { end_date: null } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.slice(0, 10))) return invalidIsoDate();
      return { ok: true, patch: { end_date: t.slice(0, 10) } };
    }
    case 'status': {
      const x = raw.trim();
      if (!x) return { ok: false, error: 'Status cannot be empty.' };
      const found = STRATEGIC_TOPIC_STATUSES.find((s) => s.toLowerCase() === x.toLowerCase());
      if (!found) {
        return {
          ok: false,
          error: `Status must be one of: ${STRATEGIC_TOPIC_STATUSES.join(', ')}.`,
        };
      }
      return { ok: true, patch: { status: found as StrategicTopicKpiStatus } };
    }
    case 'notes':
      return { ok: true, patch: { notes: raw.trim() || null } };
    default:
      return { ok: false, error: 'Unknown column.' };
  }
}

export function getStTopicEditorSeed(column: StTopicGridColumn, row: StrategicTopicKpiRow): string {
  switch (column) {
    case 'objective':
      return row.objective_text ?? '';
    case 'activity':
      return row.activity ?? '';
    case 'duration':
      return row.expected_duration ?? '';
    case 'start':
      return row.start_date ? String(row.start_date).slice(0, 10) : '';
    case 'end':
      return row.end_date ? String(row.end_date).slice(0, 10) : '';
    case 'status':
      return row.status ?? '';
    case 'notes':
      return row.notes ?? '';
    default:
      return '';
  }
}
