export type MealValidationSeverity = 'error' | 'warning';

export interface MealValidationIssue {
  severity: MealValidationSeverity;
  code: string;
  message_ar: string;
  message_en: string;
  excel_row?: number | null;
  row_index?: number | null;
  identifiers?: Record<string, unknown>;
}

export type MealValidateMode = 'both' | 'cases' | 'services';

export interface MealValidationResult {
  engine_version?: string;
  validate_mode?: MealValidateMode;
  ok: boolean;
  errors_count: number;
  warnings_count: number;
  summary_ar: string;
  summary_en: string;
  messages_ar: string;
  messages_en: string;
  issues: MealValidationIssue[];
  column_report?: Record<string, unknown>;
  column_validation?: Record<string, unknown>;
  missing_required_columns?: string[];
}
