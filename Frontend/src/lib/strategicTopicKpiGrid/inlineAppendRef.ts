/**
 * Mutable ref for keyboard-driven inline row append (Strategic Topic KPI table).
 * Assigned by StrategicTopicKpiTable so sheet cells can trigger append without prop drilling.
 */
export const strategicTopicKpiInlineAppendRef: {
  appendRowAndBeginEdit: null | (() => Promise<void>);
} = { appendRowAndBeginEdit: null };
