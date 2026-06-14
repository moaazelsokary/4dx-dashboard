import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import {
  STRATEGIC_TOPIC_CODES,
  STRATEGIC_TOPIC_LABELS,
  type StrategicTopicCode,
} from '@/config/strategicTopics';
import {
  getDepartmentObjectives,
  getDepartments,
  getStrategicDepartmentObjectives,
  getStrategicTopicKpiRows,
} from '@/services/wigService';
import type { Department, DepartmentObjective, StrategicDepartmentObjective, StrategicTopicKpiRow } from '@/types/wig';
import { isTopicActivityKpiRow } from '@/pages/strategic-topics/strategicTopicKpiUtils';
import type {
  MealLearningActivityLink,
  MealLearningActivityLinkType,
  MealLearningPoint,
  MealLearningPointStatus,
} from '@/types/mealLearning';
import { MEAL_LEARNING_STATUS_OPTIONS } from '@/types/mealLearning';

export type ActivitySource = 'topics' | 'departments' | '';
export type DepartmentObjectiveKind = 'bau' | 'strategic' | '';

const ALL_VALUE = '__all__';

type ActivityOption = {
  id: number;
  link_type: MealLearningActivityLinkType;
  label: string;
  sublabel?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: MealLearningPoint | null;
  onSave: (payload: {
    learning_point: string;
    corrective_action: string | null;
    status: MealLearningPointStatus;
    end_date: string | null;
    activity_links: MealLearningActivityLink[];
  }) => Promise<void>;
};

function linkKey(link_type: string, linked_id: number): string {
  return `${link_type}:${linked_id}`;
}

function activityLabel(row: StrategicTopicKpiRow): string {
  return (row.activity || row.objective_text || `Row ${row.id}`).trim();
}

function deptActivityLabel(row: DepartmentObjective | StrategicDepartmentObjective): string {
  return (row.activity || row.kpi || `Objective ${row.id}`).trim();
}

export default function MealLearningPointFormModal({ open, onOpenChange, initial, onSave }: Props) {
  const isEdit = Boolean(initial?.id);

  const [learningPoint, setLearningPoint] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [status, setStatus] = useState<MealLearningPointStatus>('pending');
  const [endDate, setEndDate] = useState('');
  const [activitySource, setActivitySource] = useState<ActivitySource>('');
  const [topicCode, setTopicCode] = useState<StrategicTopicCode | ''>('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [deptKind, setDeptKind] = useState<DepartmentObjectiveKind>('');
  const [formLinks, setFormLinks] = useState<MealLearningActivityLink[]>([]);
  const [saving, setSaving] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activitySearch, setActivitySearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setActivitySearch('');
    setLearningPoint(initial?.learning_point ?? '');
    setCorrectiveAction(initial?.corrective_action ?? '');
    setStatus((initial?.status as MealLearningPointStatus) ?? 'pending');
    setEndDate(initial?.end_date ? String(initial.end_date).slice(0, 10) : '');
    setFormLinks(
      (initial?.activity_links ?? []).map((l) => ({
        link_type: l.link_type,
        linked_id: l.linked_id,
      }))
    );

    const first = initial?.activity_links?.[0];
    if (first?.link_type === 'strategic_topic_kpi') {
      setActivitySource('');
      const code = STRATEGIC_TOPIC_CODES.find(
        (c) => STRATEGIC_TOPIC_LABELS[c].toLowerCase() === String(first.source_label ?? '').toLowerCase()
          || c === String(first.source_label ?? '').toLowerCase()
      );
      setTopicCode(code || '');
      setDepartmentCode('');
      setDeptKind('');
    } else if (first?.link_type === 'department_objective') {
      setActivitySource('');
      setTopicCode('');
      setDeptKind('bau');
      setDepartmentCode(first.source_label ? String(first.source_label) : '');
    } else if (first?.link_type === 'strategic_department_objective') {
      setActivitySource('');
      setTopicCode('');
      setDeptKind('strategic');
      setDepartmentCode(first.source_label ? String(first.source_label) : '');
    } else {
      setActivitySource('');
      setTopicCode('');
      setDepartmentCode('');
      setDeptKind('');
    }
  }, [open, initial]);

  const needsActivityLoad = useMemo(() => {
    if (!open) return false;
    if (activitySource || topicCode || departmentCode) return true;
    return activitySearch.trim().length > 0;
  }, [open, activitySource, topicCode, departmentCode, activitySearch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const depts = await getDepartments();
        if (!cancelled) setDepartments(depts);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !needsActivityLoad) {
      setActivityOptions([]);
      setLoadingActivities(false);
      return;
    }

    let cancelled = false;
    setLoadingActivities(true);

    let loadTopics = false;
    let loadDepts = false;
    if (activitySource === 'topics') {
      loadTopics = true;
    } else if (activitySource === 'departments') {
      loadDepts = true;
    } else if (topicCode && departmentCode) {
      loadTopics = true;
      loadDepts = true;
    } else if (topicCode) {
      loadTopics = true;
    } else if (departmentCode) {
      loadDepts = true;
    } else {
      loadTopics = true;
      loadDepts = true;
    }

    const topicCodes = topicCode ? [topicCode] : STRATEGIC_TOPIC_CODES;
    const deptCodes = departmentCode
      ? [departmentCode]
      : departments.map((d) => String(d.code || '').trim()).filter(Boolean);
    const deptKinds: Array<'bau' | 'strategic'> = deptKind ? [deptKind] : ['bau', 'strategic'];

    void (async () => {
      try {
        const options: ActivityOption[] = [];
        const seen = new Set<string>();

        const pushOption = (opt: ActivityOption) => {
          const key = linkKey(opt.link_type, opt.id);
          if (seen.has(key)) return;
          seen.add(key);
          options.push(opt);
        };

        if (loadTopics) {
          const topicResults = await Promise.all(topicCodes.map((code) => getStrategicTopicKpiRows(code)));
          topicResults.forEach((rows, idx) => {
            const code = topicCodes[idx];
            const topicLabel = STRATEGIC_TOPIC_LABELS[code];
            for (const r of rows.filter(isTopicActivityKpiRow)) {
              if (!activityLabel(r)) continue;
              const kpi = (r.objective_text || r.kpi || '').trim();
              pushOption({
                id: r.id,
                link_type: 'strategic_topic_kpi',
                label: activityLabel(r),
                sublabel: kpi ? `[${topicLabel}] ${kpi}` : `[${topicLabel}]`,
              });
            }
          });
        }

        if (loadDepts && deptCodes.length > 0) {
          for (const code of deptCodes) {
            for (const kind of deptKinds) {
              const rows =
                kind === 'bau'
                  ? await getDepartmentObjectives({ department_code: code })
                  : await getStrategicDepartmentObjectives({ department_code: code });
              const kindLabel = kind === 'bau' ? 'BAU' : 'Strategic';
              for (const r of rows) {
                if (!(r.activity || r.kpi || '').trim()) continue;
                const kpi = (r.kpi || '').trim();
                pushOption({
                  id: r.id,
                  link_type: kind === 'bau' ? 'department_objective' : 'strategic_department_objective',
                  label: deptActivityLabel(r),
                  sublabel: kpi ? `[${code} · ${kindLabel}] ${kpi}` : `[${code} · ${kindLabel}]`,
                });
              }
            }
          }
        }

        if (!cancelled) {
          options.sort((a, b) => a.label.localeCompare(b.label));
          setActivityOptions(options);
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: 'Could not load activities',
            description: e instanceof Error ? e.message : 'Request failed',
            variant: 'destructive',
          });
          setActivityOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingActivities(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    needsActivityLoad,
    activitySource,
    topicCode,
    departmentCode,
    deptKind,
    departments,
  ]);

  const filteredActivityOptions = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    if (!q) return activityOptions;
    return activityOptions.filter((opt) => {
      const haystack = `${opt.label} ${opt.sublabel ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activityOptions, activitySearch]);

  const selectedKeys = useMemo(
    () => new Set(formLinks.map((l) => linkKey(l.link_type, l.linked_id))),
    [formLinks]
  );

  const toggleLink = useCallback((opt: ActivityOption, checked: boolean) => {
    const key = linkKey(opt.link_type, opt.id);
    setFormLinks((prev) => {
      if (checked) {
        if (prev.some((l) => linkKey(l.link_type, l.linked_id) === key)) return prev;
        return [...prev, { link_type: opt.link_type, linked_id: opt.id }];
      }
      return prev.filter((l) => linkKey(l.link_type, l.linked_id) !== key);
    });
  }, []);

  const handleSubmit = async () => {
    const lp = learningPoint.trim();
    if (!lp) {
      toast({ title: 'Learning point is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        learning_point: lp,
        corrective_action: correctiveAction.trim() || null,
        status,
        end_date: endDate.trim() || null,
        activity_links: formLinks,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: isEdit ? 'Could not update' : 'Could not create',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[min(95vw,50.4rem)] !max-w-[50.4rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit learning point' : 'Add learning point'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="lp-learning-point">Learning point</Label>
            <Textarea
              id="lp-learning-point"
              value={learningPoint}
              onChange={(e) => setLearningPoint(e.target.value)}
              rows={3}
              placeholder="Describe what was learned"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lp-corrective">Corrective action</Label>
            <Textarea
              id="lp-corrective"
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              rows={2}
              placeholder="Actions taken or planned"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as MealLearningPointStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_LEARNING_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lp-end-date">End date</Label>
              <Input
                id="lp-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/80 p-4 space-y-3">
            <Label className="text-sm font-medium">Relative activity</Label>

            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Search all activities…"
                className="pl-8 h-9"
                aria-label="Search activities"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Select
                  value={activitySource || ALL_VALUE}
                  onValueChange={(v) => {
                    const next = v === ALL_VALUE ? '' : (v as ActivitySource);
                    setActivitySource(next);
                    if (next === 'topics') {
                      setDepartmentCode('');
                      setDeptKind('');
                    } else if (next === 'departments') {
                      setTopicCode('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All sources</SelectItem>
                    <SelectItem value="topics">Strategic topics</SelectItem>
                    <SelectItem value="departments">Department objectives</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {activitySource !== 'departments' ? (
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">Topic</Label>
                  <Select
                    value={topicCode || ALL_VALUE}
                    onValueChange={(v) => setTopicCode(v === ALL_VALUE ? '' : (v as StrategicTopicCode))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All topics" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>All topics</SelectItem>
                      {STRATEGIC_TOPIC_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {STRATEGIC_TOPIC_LABELS[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {activitySource !== 'topics' ? (
                <>
                  <div className="grid gap-2">
                    <Label className="text-xs text-muted-foreground">Department</Label>
                    <Select
                      value={departmentCode || ALL_VALUE}
                      onValueChange={(v) => setDepartmentCode(v === ALL_VALUE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All departments</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.code}>
                            {d.code} — {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Objective type</Label>
                    <Select
                      value={deptKind || ALL_VALUE}
                      onValueChange={(v) => setDeptKind(v === ALL_VALUE ? '' : (v as DepartmentObjectiveKind))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All objective types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>All objective types</SelectItem>
                        <SelectItem value="bau">BAU department objectives</SelectItem>
                        <SelectItem value="strategic">Strategic department objectives</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </div>

            <div className="text-xs text-muted-foreground">
              {formLinks.length} activit{formLinks.length === 1 ? 'y' : 'ies'} linked (across all sources)
              {activitySearch.trim() && activityOptions.length > 0
                ? ` · Showing ${filteredActivityOptions.length} of ${activityOptions.length}`
                : ''}
            </div>

            <ScrollArea className="h-72 rounded-md border border-border/60 p-2">
              {!needsActivityLoad ? (
                <p className="text-sm text-muted-foreground py-4 text-center px-2">
                  Search to browse all activities, or narrow by source, topic, or department.
                </p>
              ) : loadingActivities ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading activities…
                </div>
              ) : activityOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activities found</p>
              ) : filteredActivityOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activities match your search</p>
              ) : (
                <div className="space-y-2">
                  {filteredActivityOptions.map((opt) => {
                    const key = linkKey(opt.link_type, opt.id);
                    const checked = selectedKeys.has(key);
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleLink(opt, v === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm block whitespace-pre-wrap break-words">{opt.label}</span>
                          {opt.sublabel && (
                            <span className="text-xs text-muted-foreground block whitespace-pre-wrap break-words">
                              {opt.sublabel}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save changes' : 'Add learning point'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
