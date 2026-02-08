import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Target, Loader2 } from 'lucide-react';
import { getDepartmentObjectivesByKPI, getRASCIByKPI } from '@/services/wigService';
import type {
  HierarchicalPlan,
  PillarGroup,
  ObjectiveGroup,
  TargetGroup,
  KPIGroup,
  DepartmentObjective,
  RASCI,
} from '@/types/wig';
import BidirectionalText from '@/components/ui/BidirectionalText';

interface WBSMindMapViewProps {
  data: HierarchicalPlan;
}

/** Derive RASCI role string (e.g. "R", "A,S") from boolean flags */
function getRASCIRoleString(rasci: RASCI): string {
  const parts: string[] = [];
  if (rasci.responsible) parts.push('R');
  if (rasci.accountable) parts.push('A');
  if (rasci.supportive) parts.push('S');
  if (rasci.consulted) parts.push('C');
  if (rasci.informed) parts.push('I');
  return parts.join(', ');
}

function groupObjectivesByDepartment(
  objectives: DepartmentObjective[]
): Map<string, DepartmentObjective[]> {
  const map = new Map<string, DepartmentObjective[]>();
  for (const obj of objectives) {
    const key = obj.department_name ?? `Department ${obj.department_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(obj);
  }
  return map;
}

function buildRASCIMap(rasciList: RASCI[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rasciList) {
    const role = getRASCIRoleString(r);
    if (role) map.set(r.department.trim(), role);
  }
  return map;
}

const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];

/** Unique keys for expand state */
function pillarKey(p: PillarGroup) {
  return `pillar-${p.pillar}`;
}
function objectiveKey(p: PillarGroup, o: ObjectiveGroup) {
  return `obj-${p.pillar}-${o.objectiveId}`;
}
function targetKey(p: PillarGroup, o: ObjectiveGroup, t: TargetGroup) {
  return `target-${o.objectiveId}-${t.target}`;
}
function kpiKey(k: KPIGroup) {
  return k.kpi;
}

export default function WBSMindMapView({ data }: WBSMindMapViewProps) {
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [expandedKPIs, setExpandedKPIs] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<
    Record<string, { objectives: DepartmentObjective[]; rasci: RASCI[] } | 'loading' | null>
  >({});

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const loadBreakdown = useCallback(async (kpi: string) => {
    const key = kpi;
    setBreakdownCache((c) => {
      if (c[key] === 'loading' || (c[key] && typeof c[key] === 'object' && 'objectives' in c[key]!))
        return c;
      return { ...c, [key]: 'loading' };
    });
    try {
      const [objectives, rasci] = await Promise.all([
        getDepartmentObjectivesByKPI(kpi),
        getRASCIByKPI(kpi),
      ]);
      setBreakdownCache((c) => ({ ...c, [key]: { objectives, rasci } }));
    } catch {
      setBreakdownCache((c) => ({ ...c, [key]: null }));
    }
  }, []);

  const handleToggleBreakdown = useCallback(
    (kpi: string) => {
      const isExpanded = expandedKPIs.has(kpi);
      if (!isExpanded) loadBreakdown(kpi);
      toggle(setExpandedKPIs, kpi);
    },
    [expandedKPIs, loadBreakdown, toggle]
  );

  const sortedPillars = [...data.pillars].sort((a, b) => {
    const ai = pillarOrder.indexOf(a.pillar);
    const bi = pillarOrder.indexOf(b.pillar);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="p-6 overflow-auto min-h-[400px]">
      {/* Flowchart: top to bottom */}
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
        {/* Level 0: Root */}
        <div className="rounded-xl bg-emerald-600 text-white px-6 py-3 font-bold text-base shadow-lg text-center">
          Work Breakdown Structure
        </div>

        {/* Vertical connector from root */}
        <div className="w-0.5 h-6 bg-emerald-500/60 rounded-full my-1" />

        {/* Level 1: Pillars in a row (beside each other), each column has its subtree below */}
        <div className="flex flex-row gap-6 justify-center items-start flex-wrap w-full">
          {sortedPillars.map((pillar) => {
            const pKey = pillarKey(pillar);
            const isPillarExpanded = expandedPillars.has(pKey);
            const hasChildren = pillar.objectives.length > 0;

            return (
              <div key={pKey} className="flex flex-col items-center min-w-[200px] max-w-[320px] flex-1">
                <button
                  type="button"
                  onClick={() => hasChildren && toggle(setExpandedPillars, pKey)}
                  className={`rounded-xl px-4 py-2.5 font-semibold text-sm shadow-md w-full max-w-md flex items-center justify-between gap-2 transition-colors ${
                    hasChildren
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                      : 'bg-emerald-600/80 text-white cursor-default'
                  }`}
                >
                  <span className="text-left truncate">{pillar.pillar}</span>
                  {hasChildren && (
                    <span className="shrink-0">
                      {isPillarExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </button>

                {hasChildren && isPillarExpanded && (
                  <>
                    <div className="w-0.5 h-4 bg-emerald-400/50 rounded-full my-1" />
                    <div className="flex flex-col items-center w-full gap-2 pl-0">
                      {pillar.objectives.map((obj) => {
                        const oKey = objectiveKey(pillar, obj);
                        const isObjExpanded = expandedObjectives.has(oKey);
                        const hasTargets = obj.targets.length > 0;

                        return (
                          <div key={oKey} className="flex flex-col items-center w-full">
                            <button
                              type="button"
                              onClick={() => hasTargets && toggle(setExpandedObjectives, oKey)}
                              className={`rounded-lg px-3 py-2 text-sm font-medium w-full max-w-md flex items-center justify-between gap-2 border transition-colors ${
                                hasTargets
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-foreground hover:bg-emerald-500/30 cursor-pointer'
                                  : 'bg-muted/60 border-border text-foreground cursor-default'
                              }`}
                            >
                              <span className="text-left truncate">
                                <BidirectionalText>{obj.objective}</BidirectionalText>
                              </span>
                              {hasTargets && (
                                <span className="shrink-0">
                                  {isObjExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </span>
                              )}
                            </button>

                            {hasTargets && isObjExpanded && (
                              <>
                                <div className="w-0.5 h-3 bg-border rounded-full my-1" />
                                <div className="flex flex-col items-center w-full gap-2">
                                  {obj.targets.map((target) => {
                                    const tKey = targetKey(pillar, obj, target);
                                    const isTargetExpanded = expandedTargets.has(tKey);
                                    const hasKpis = target.kpis.length > 0;

                                    return (
                                      <div key={tKey} className="flex flex-col items-center w-full">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            hasKpis && toggle(setExpandedTargets, tKey)
                                          }
                                          className={`rounded-md px-3 py-1.5 text-xs font-medium w-full max-w-md flex items-center justify-between gap-2 border transition-colors ${
                                            hasKpis
                                              ? 'bg-muted/80 border-border text-foreground hover:bg-muted cursor-pointer'
                                              : 'bg-muted/50 border-border text-muted-foreground cursor-default'
                                          }`}
                                        >
                                          <span className="text-left truncate">
                                            <BidirectionalText>{target.target}</BidirectionalText>
                                          </span>
                                          {hasKpis && (
                                            <span className="shrink-0">
                                              {isTargetExpanded ? (
                                                <ChevronDown className="h-3.5 w-3.5" />
                                              ) : (
                                                <ChevronRight className="h-3.5 w-3.5" />
                                              )}
                                            </span>
                                          )}
                                        </button>

                                        {hasKpis && isTargetExpanded && (
                                          <>
                                            <div className="w-0.5 h-2 bg-border rounded-full my-1" />
                                            <div className="flex flex-col items-center w-full gap-2">
                                              {target.kpis.map((kpi) => {
                                                const kKey = kpiKey(kpi);
                                                const isKpiExpanded = expandedKPIs.has(kKey);
                                                const cached = breakdownCache[kKey];
                                                const isLoading = cached === 'loading';
                                                const hasData =
                                                  cached &&
                                                  typeof cached === 'object' &&
                                                  'objectives' in cached;

                                                return (
                                                  <div
                                                    key={kKey}
                                                    className="flex flex-col items-center w-full"
                                                  >
                                                    <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-md">
                                                      <div className="rounded-lg bg-primary/15 border border-primary/30 px-3 py-2 text-sm font-medium text-foreground flex items-center gap-2 flex-1 min-w-0">
                                                        <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                        <span className="truncate">
                                                          <BidirectionalText>
                                                            {kpi.kpi.replace(
                                                              /^\d+(\.\d+)*(\.\d+)?\s*/,
                                                              ''
                                                            ).trim() || kpi.kpi}
                                                          </BidirectionalText>
                                                        </span>
                                                        <span className="text-xs text-muted-foreground shrink-0">
                                                          ({kpi.annual_target.toLocaleString()})
                                                        </span>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          handleToggleBreakdown(kpi.kpi)
                                                        }
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/30 transition-colors shrink-0"
                                                      >
                                                        {isKpiExpanded ? (
                                                          <>
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                            Hide
                                                          </>
                                                        ) : (
                                                          <>
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                            Breakdown
                                                          </>
                                                        )}
                                                      </button>
                                                    </div>

                                                    {isKpiExpanded && (
                                                      <>
                                                        <div className="w-0.5 h-2 bg-border rounded-full my-1" />
                                                        <div className="w-full max-w-md rounded-md bg-muted/30 border border-border py-2 px-3 space-y-3">
                                                          {isLoading && (
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                              <Loader2 className="h-4 w-4 animate-spin" />
                                                              Loading…
                                                            </div>
                                                          )}
                                                          {cached === null && (
                                                            <div className="text-sm text-muted-foreground py-2">
                                                              Failed to load.
                                                            </div>
                                                          )}
                                                          {hasData && cached && (
                                                            <>
                                                              {cached.objectives.length === 0 ? (
                                                                <div className="text-sm text-muted-foreground py-2">
                                                                  No department objectives.
                                                                </div>
                                                              ) : (
                                                                (() => {
                                                                  const byDept =
                                                                    groupObjectivesByDepartment(
                                                                      cached.objectives
                                                                    );
                                                                  const rasciMap = buildRASCIMap(
                                                                    cached.rasci
                                                                  );
                                                                  return (
                                                                    <div className="space-y-4">
                                                                      {Array.from(
                                                                        byDept.entries()
                                                                      ).map(
                                                                        ([deptName, objectives]) => {
                                                                          const rasciLetter =
                                                                            rasciMap.get(
                                                                              deptName.trim()
                                                                            ) ?? '';
                                                                          return (
                                                                            <div
                                                                              key={deptName}
                                                                              className="space-y-1.5"
                                                                            >
                                                                              <div className="flex items-center gap-2 font-medium text-sm">
                                                                                <span className="text-foreground">
                                                                                  {deptName}
                                                                                </span>
                                                                                {rasciLetter && (
                                                                                  <span className="rounded bg-primary/20 text-primary px-1.5 py-0.5 text-xs font-semibold">
                                                                                    ({rasciLetter})
                                                                                  </span>
                                                                                )}
                                                                              </div>
                                                                              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                                                                                {objectives.map(
                                                                                  (obj) => (
                                                                                    <li
                                                                                      key={obj.id}
                                                                                      className="flex items-start gap-2"
                                                                                    >
                                                                                      <span className="text-foreground">
                                                                                        <BidirectionalText>
                                                                                          {
                                                                                            obj.activity
                                                                                          }
                                                                                        </BidirectionalText>
                                                                                      </span>
                                                                                      {(obj.type ===
                                                                                        'Direct' ||
                                                                                        obj.type ===
                                                                                          'In direct') && (
                                                                                        <span
                                                                                          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                                                            obj.type ===
                                                                                            'Direct'
                                                                                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                                                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                                                          }`}
                                                                                        >
                                                                                          {obj.type ===
                                                                                          'Direct'
                                                                                            ? 'Direct'
                                                                                            : 'In direct'}
                                                                                        </span>
                                                                                      )}
                                                                                    </li>
                                                                                  )
                                                                                )}
                                                                              </ul>
                                                                            </div>
                                                                          );
                                                                        }
                                                                      )}
                                                                    </div>
                                                                  );
                                                                })()
                                                              )}
                                                            </>
                                                          )}
                                                        </div>
                                                      </>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
