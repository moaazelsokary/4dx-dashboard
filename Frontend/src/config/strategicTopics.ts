/**
 * Canonical strategic topic pillars (Volunteers, Refugees, Returnees, …).
 * Keep in sync with netlify/functions/utils/strategic-topics.cjs
 */

export const STRATEGIC_TOPIC_NAV_ITEMS = [
  { code: 'volunteers', label: 'Volunteers', path: '/main-plan/volunteers', iconSrc: '/volunteers.png' },
  { code: 'refugees', label: 'Refugees', path: '/main-plan/refugees', iconSrc: '/Refugees.png' },
  {
    code: 'returnees',
    label: 'Returnees',
    path: '/main-plan/returnees',
    iconSrc: '/Returnees.png',
    iconClassName:
      '[filter:brightness(0)_saturate(100%)_invert(52%)_sepia(61%)_saturate(654%)_hue-rotate(120deg)_brightness(92%)_contrast(97%)]',
  },
  { code: 'relief', label: 'Relief', path: '/main-plan/relief', iconSrc: '/Relief.png' },
  {
    code: 'awareness',
    label: 'Awareness',
    path: '/main-plan/awareness',
    iconSrc: '/Awareness.png',
    iconClassName:
      '[filter:brightness(0)_saturate(100%)_invert(52%)_sepia(61%)_saturate(654%)_hue-rotate(120deg)_brightness(92%)_contrast(97%)]',
  },
  { code: 'pwd', label: 'PWD', path: '/main-plan/pwd', iconSrc: '/PWD.png' },
  { code: 'funding', label: 'Funding', path: '/main-plan/funding', iconSrc: '/Funding.png' },
  { code: 'community', label: 'Community', path: '/main-plan/community', iconSrc: '/Community.png' },
] as const;

export type StrategicTopicCode = (typeof STRATEGIC_TOPIC_NAV_ITEMS)[number]['code'];

export const STRATEGIC_TOPIC_ICON_BY_CODE: Record<StrategicTopicCode, string> = Object.fromEntries(
  STRATEGIC_TOPIC_NAV_ITEMS.map((t) => [t.code, t.iconSrc])
) as Record<StrategicTopicCode, string>;

/** Optional sidebar tint (monochrome → brand green). Full-color PNGs omit this. */
export function strategicTopicIconClassName(code: StrategicTopicCode): string | undefined {
  const item = STRATEGIC_TOPIC_NAV_ITEMS.find((t) => t.code === code);
  return item && 'iconClassName' in item ? item.iconClassName : undefined;
}

export const STRATEGIC_TOPIC_CODES: StrategicTopicCode[] = STRATEGIC_TOPIC_NAV_ITEMS.map((t) => t.code);

export const STRATEGIC_TOPIC_LABELS: Record<StrategicTopicCode, string> = Object.fromEntries(
  STRATEGIC_TOPIC_NAV_ITEMS.map((t) => [t.code, t.label])
) as Record<StrategicTopicCode, string>;

export const STRATEGIC_TOPIC_PATHS = STRATEGIC_TOPIC_NAV_ITEMS.map((t) => t.path);

export function isStrategicTopicCode(value: string): value is StrategicTopicCode {
  return STRATEGIC_TOPIC_CODES.includes(value as StrategicTopicCode);
}
