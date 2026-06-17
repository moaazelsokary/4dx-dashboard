import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import BidirectionalText from '@/components/ui/BidirectionalText';
import type { CmMealRoleSkill, CmMealRoleTaskItem } from '@/types/wig';

export type DraftTaskItem = {
  task: string;
  workload_percent: string;
  technical_skills: CmMealRoleSkill[];
  soft_skills: CmMealRoleSkill[];
};

export function emptyDraftTaskItem(): DraftTaskItem {
  return {
    task: '',
    workload_percent: '',
    technical_skills: [],
    soft_skills: [],
  };
}

export function draftItemsFromRow(items: CmMealRoleTaskItem[]): DraftTaskItem[] {
  if (!items.length) return [emptyDraftTaskItem()];
  return items.map((item) => ({
    task: item.task,
    workload_percent: item.workload_percent == null ? '' : String(item.workload_percent),
    technical_skills: [...(item.technical_skills ?? [])],
    soft_skills: [...(item.soft_skills ?? [])],
  }));
}

export function parseDraftTaskItems(items: DraftTaskItem[]): CmMealRoleTaskItem[] | { error: string } {
  const out: CmMealRoleTaskItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const task = item.task.trim();
    const hasOtherData =
      item.workload_percent.trim() !== '' ||
      item.technical_skills.some((s) => s.name.trim()) ||
      item.soft_skills.some((s) => s.name.trim());

    if (!task) {
      if (items.length > 1 || hasOtherData) {
        return { error: `Task ${i + 1} requires a name` };
      }
      continue;
    }
    const workload = item.workload_percent.trim() === '' ? null : Number(item.workload_percent);
    if (item.workload_percent.trim() !== '' && Number.isNaN(workload)) {
      return { error: 'Workload % must be a number' };
    }
    if (workload != null && (workload <= 0 || workload >= 101)) {
      return { error: 'Workload % must be greater than 0 and less than 101' };
    }
    out.push({
      task,
      workload_percent: workload,
      technical_skills: item.technical_skills.filter((s) => s.name.trim()),
      soft_skills: item.soft_skills.filter((s) => s.name.trim()),
    });
  }
  if (!out.length) return { error: 'At least one task is required' };
  return out;
}

function SkillsEditorInline({
  label,
  skills,
  onChange,
}: {
  label: string;
  skills: CmMealRoleSkill[];
  onChange: (next: CmMealRoleSkill[]) => void;
}) {
  const add = () => onChange([...skills, { name: '', exists: true }]);
  const update = (index: number, patch: Partial<CmMealRoleSkill>) => {
    onChange(skills.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const remove = (index: number) => onChange(skills.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No skills yet.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 text-xs flex-1 min-w-[8rem]"
                placeholder="Skill name"
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <label className="inline-flex items-center gap-1.5 text-xs shrink-0">
                <Checkbox checked={s.exists} onCheckedChange={(v) => update(i, { exists: v === true })} />
                Exists
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => remove(i)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskItemsEditor({
  items,
  onChange,
}: {
  items: DraftTaskItem[];
  onChange: (next: DraftTaskItem[]) => void;
}) {
  const add = () => onChange([...items, emptyDraftTaskItem()]);
  const update = (index: number, patch: Partial<DraftTaskItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Tasks</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" />
          Add task
        </Button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="rounded-md border border-border/60 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Task {index + 1}</span>
            {items.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => remove(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Task</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Enter task"
              value={item.task}
              onChange={(e) => update(index, { task: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">% Workload</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              min={0.01}
              max={100.99}
              step="0.01"
              inputMode="decimal"
              placeholder="Optional"
              value={item.workload_percent}
              onChange={(e) => update(index, { workload_percent: e.target.value })}
            />
          </div>
          <SkillsEditorInline
            label="Technical skills"
            skills={item.technical_skills}
            onChange={(technical_skills) => update(index, { technical_skills })}
          />
          <SkillsEditorInline
            label="Soft skills"
            skills={item.soft_skills}
            onChange={(soft_skills) => update(index, { soft_skills })}
          />
        </div>
      ))}
    </div>
  );
}

export function SkillChip({ skill }: { skill: CmMealRoleSkill }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1 shrink-0">
      <BidirectionalText className="text-xs font-medium text-foreground">{skill.name}</BidirectionalText>
      <Checkbox checked={skill.exists} disabled className="h-3.5 w-3.5" />
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {skill.exists ? 'Exists' : 'Not exist'}
      </span>
    </span>
  );
}
