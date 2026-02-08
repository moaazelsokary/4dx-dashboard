import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Target, Loader2 } from 'lucide-react';
import { getDepartmentObjectivesByKPI, getRASCIByKPI } from '@/services/wigService';
import type { HierarchicalPlan, DepartmentObjective, RASCI } from '@/types/wig';
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

/** Group department objectives by department name */
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

/** Build RASCI map by department (normalized name) for a KPI */
function buildRASCIMap(rasciList: RASCI[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rasciList) {
    const role = getRASCIRoleString(r);
    if (role) map.set(r.department.trim(), role);
  }
  return map;
}

const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];

export default function WBSMindMapView({ data }: WBSMindMapViewProps) {
  const [expandedKPIs, setExpandedKPIs] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<
    Record<
      string,
      { objectives: DepartmentObjective[]; rasci: RASCI[] } | 'loading' | null
    >
  >({});

  const toggleKPI = useCallback((kpiKey: string) => {
    setExpandedKPIs((prev) => {
      const next = new Set(prev);
      if (next.has(kpiKey)) next.delete(kpiKey);
      else next.add(kpiKey);
      return next;
    });
  }, []);

  const loadBreakdown = useCallback(async (kpi: string) => {
    const key = kpi;
    setBreakdownCache((c) => {
      if (c[key] === 'loading' || (c[key] && typeof c[key] === 'object' && 'objectives' in c[key]!)) return c;
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
      const key = kpi;
      const isExpanded = expandedKPIs.has(key);
      if (!isExpanded) loadBreakdown(kpi);
      toggleKPI(key);
    },
    [expandedKPIs, loadBreakdown, toggleKPI]
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
    <div className="space-y-6 p-4 overflow-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-lg font-bold text-foreground">Work Breakdown Structure</h2>
        <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400 mt-1">Main Plan</p>
      </div>

      {/* Tree: Pillars → Objectives → Targets → KPIs → (Breakdown) */}
      <div className="flex flex-col gap-6">
        {sortedPillars.map((pillar) => (
          <div key={pillar.pillar} className="space-y-3">
            {/* Pillar node */}
            <div className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 font-semibold text-sm shadow-md max-w-fit">
              {pillar.pillar}
            </div>
            <div className="pl-6 border-l-2 border-emerald-400/50 space-y-4">
              {pillar.objectives.map((obj) => (
                <div key={`${pillar.pillar}-${obj.objective}`} className="space-y-2">
                  <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 text-sm font-medium text-foreground max-w-xl">
                    <BidirectionalText>{obj.objective}</BidirectionalText>
                  </div>
                  <div className="pl-6 border-l-2 border-emerald-300/40 space-y-2">
                    {obj.targets.map((target) => (
                      <div key={`${obj.objectiveId}-${target.target}`} className="space-y-2">
                        <div className="rounded-md bg-muted/80 border border-border px-3 py-1.5 text-xs font-medium text-foreground max-w-lg">
                          <BidirectionalText>{target.target}</BidirectionalText>
                        </div>
                        <div className="pl-4 space-y-3">
                          {target.kpis.map((kpi) => {
                            const kpiKey = kpi.kpi;
                            const isExpanded = expandedKPIs.has(kpiKey);
                            const cached = breakdownCache[kpiKey];
                            const isLoading = cached === 'loading';
                            const hasData = cached && typeof cached === 'object' && 'objectives' in cached;

                            return (
                              <div key={kpiKey} className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="rounded-lg bg-primary/15 border border-primary/30 px-3 py-2 text-sm font-medium text-foreground flex items-center gap-2">
                                    <Target className="h-3.5 w-3.5 text-primary" />
                                    <BidirectionalText>{kpi.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim() || kpi.kpi}</BidirectionalText>
                                    <span className="text-xs text-muted-foreground font-normal">
                                      ({kpi.annual_target.toLocaleString()})
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBreakdown(kpi.kpi)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/30 transition-colors"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                        Hide breakdown
                                      </>
                                    ) : (
                                      <>
                                        <ChevronRight className="h-3.5 w-3.5" />
                                        Show breakdown
                                      </>
                                    )}
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="pl-4 mt-2 border-l-2 border-border rounded-r-md bg-muted/30 py-2 pr-3 space-y-3">
                                    {isLoading && (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading breakdown…
                                      </div>
                                    )}
                                    {cached === null && (
                                      <div className="text-sm text-muted-foreground py-2">
                                        Failed to load breakdown.
                                      </div>
                                    )}
                                    {hasData && cached && (
                                      <>
                                        {cached.objectives.length === 0 ? (
                                          <div className="text-sm text-muted-foreground py-2">
                                            No department objectives for this KPI.
                                          </div>
                                        ) : (
                                          (() => {
                                            const byDept = groupObjectivesByDepartment(cached.objectives);
                                            const rasciMap = buildRASCIMap(cached.rasci);
                                            return (
                                              <div className="space-y-4">
                                                {Array.from(byDept.entries()).map(([deptName, objectives]) => {
                                                  const rasciLetter = rasciMap.get(deptName.trim()) ?? '';
                                                  return (
                                                    <div key={deptName} className="space-y-1.5">
                                                      <div className="flex items-center gap-2 font-medium text-sm">
                                                        <span className="text-foreground">{deptName}</span>
                                                        {rasciLetter && (
                                                          <span className="rounded bg-primary/20 text-primary px-1.5 py-0.5 text-xs font-semibold">
                                                            ({rasciLetter})
                                                          </span>
                                                        )}
                                                      </div>
                                                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                                                        {objectives.map((obj) => (
                                                          <li key={obj.id} className="flex items-start gap-2">
                                                            <span className="text-foreground">
                                                              <BidirectionalText>{obj.activity}</BidirectionalText>
                                                            </span>
                                                            {(obj.type === 'Direct' || obj.type === 'In direct') && (
                                                              <span
                                                                className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                                  obj.type === 'Direct'
                                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                                }`}
                                                              >
                                                                {obj.type === 'Direct' ? 'Direct' : 'In direct'}
                                                              </span>
                                                            )}
                                                          </li>
                                                        ))}
                                                      </ul>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            );
                                          })()
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
