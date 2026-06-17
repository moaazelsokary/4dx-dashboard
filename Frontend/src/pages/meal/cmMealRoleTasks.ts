import type { CmMealRoleSkill, CmMealRoleTaskItem, CmMealUserRoleRow } from '@/types/wig';

export function parseTaskLines(tasks: string | null | undefined): string[] {
  if (!tasks?.trim()) return [];
  return tasks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function legacyTaskItemsFromRow(row: CmMealUserRoleRow): CmMealRoleTaskItem[] {
  const lines = parseTaskLines(row.tasks);
  const technical = row.technical_skills ?? [];
  const soft = row.soft_skills ?? [];
  const workload = row.workload_percent ?? null;

  if (!lines.length) {
    if (workload == null && !technical.length && !soft.length) return [];
    return [
      {
        task: '—',
        workload_percent: workload,
        technical_skills: technical,
        soft_skills: soft,
      },
    ];
  }

  return lines.map((task, index) => ({
    task,
    workload_percent: index === 0 ? workload : null,
    technical_skills: index === 0 ? technical : [],
    soft_skills: index === 0 ? soft : [],
  }));
}

function reconcileTaskItems(
  parsedItems: CmMealRoleTaskItem[],
  legacyItems: CmMealRoleTaskItem[]
): CmMealRoleTaskItem[] {
  if (!parsedItems.length) return legacyItems;
  if (legacyItems.length <= parsedItems.length) return parsedItems;

  return legacyItems.map((legacy, index) => {
    const current = parsedItems[index];
    if (!current) return legacy;
    return {
      task: legacy.task,
      workload_percent: current.workload_percent ?? legacy.workload_percent,
      technical_skills: current.technical_skills.length ? current.technical_skills : legacy.technical_skills,
      soft_skills: current.soft_skills.length ? current.soft_skills : legacy.soft_skills,
    };
  });
}

export function getRoleTaskItems(row: CmMealUserRoleRow): CmMealRoleTaskItem[] {
  const legacyItems = legacyTaskItemsFromRow(row);
  const parsedItems = Array.isArray(row.task_items) ? row.task_items : [];
  return reconcileTaskItems(parsedItems, legacyItems);
}

export function roleRowSearchText(row: CmMealUserRoleRow): string {
  const items = getRoleTaskItems(row);
  return [
    row.username,
    row.job_title,
    row.responsibilities,
    ...items.flatMap((item) => [
      item.task,
      item.workload_percent,
      ...item.technical_skills.map((s) => s.name),
      ...item.soft_skills.map((s) => s.name),
    ]),
  ]
    .join(' ')
    .toLowerCase();
}
