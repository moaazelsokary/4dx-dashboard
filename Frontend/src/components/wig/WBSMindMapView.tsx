import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Target, Loader2, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
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

/** Key is normalized (trimmed) so we can match RASCI department names */
function groupObjectivesByDepartment(
  objectives: DepartmentObjective[]
): Map<string, DepartmentObjective[]> {
  const map = new Map<string, DepartmentObjective[]>();
  for (const obj of objectives) {
    const raw = obj.department_name ?? `Department ${obj.department_id}`;
    const key = raw.trim();
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

/** List of departments that have at least one RASCI role for this KPI (order preserved) */
function getDepartmentsWithRASCI(rasciList: RASCI[]): { department: string; role: string }[] {
  const out: { department: string; role: string }[] = [];
  for (const r of rasciList) {
    const role = getRASCIRoleString(r);
    if (role) out.push({ department: r.department.trim(), role });
  }
  return out;
}

/** Vertical arrow connector (line + arrowhead down) */
function ArrowDown({ className = 'bg-emerald-500/60', arrowColor = 'text-emerald-600 dark:text-emerald-400' }: { className?: string; arrowColor?: string }) {
  return (
    <div className={`flex flex-col items-center my-0.5 ${arrowColor}`}>
      <div className={`w-0.5 h-4 ${className}`} />
      <div
        className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-current"
        aria-hidden
      />
    </div>
  );
}

const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];

function extractNumber(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[0] : '';
}

/** Sort targets by number (1.1, 1.2, 2.1, ...) */
function sortTargets(targets: TargetGroup[]): TargetGroup[] {
  return [...targets].sort((a, b) => {
    const aNum = extractNumber(a.target, /^\d+(\.\d+)?/);
    const bNum = extractNumber(b.target, /^\d+(\.\d+)?/);
    if (!aNum && !bNum) return 0;
    if (!aNum) return 1;
    if (!bNum) return -1;
    const aParts = aNum.split('.').map(Number);
    const bParts = bNum.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

/** Sort KPIs by number (1.1.1, 1.1.2, ...) */
function sortKPIs(kpis: KPIGroup[]): KPIGroup[] {
  return [...kpis].sort((a, b) => {
    const aNum = extractNumber(a.kpi, /^\d+(\.\d+)*(\.\d+)?/);
    const bNum = extractNumber(b.kpi, /^\d+(\.\d+)*(\.\d+)?/);
    if (!aNum && !bNum) return 0;
    if (!aNum) return 1;
    if (!bNum) return -1;
    const aParts = aNum.split('.').map(Number);
    const bParts = bNum.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

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

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.12;
/** Use full fit (no extra shrink) */
const FIT_PADDING = 1;
/** Don't scale below this so the diagram stays readable */
const MIN_FIT_SCALE = 0.5;
/** On expand: zoom out by 25% only (less aggressive) */
const AUTO_ZOOM_OUT_FACTOR = 0.75;
const AUTO_ZOOM_IN_FACTOR = 1 / AUTO_ZOOM_OUT_FACTOR;

export default function WBSMindMapView({ data }: WBSMindMapViewProps) {
  const [zoomLevel, setZoomLevel] = useState(1.7);
  const [fitScale, setFitScale] = useState(1);
  const [fitKey, setFitKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expandedPillars, setExpandedPillars] = useState<Set<string>>(new Set());
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [expandedKPIs, setExpandedKPIs] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<
    Record<string, { objectives: DepartmentObjective[]; rasci: RASCI[] } | 'loading' | null>
  >({});

  const zoomOutAuto = useCallback(() => {
    setZoomLevel((z) => Math.max(MIN_ZOOM, z * AUTO_ZOOM_OUT_FACTOR));
  }, []);

  const zoomInAuto = useCallback(() => {
    setZoomLevel((z) => Math.min(MAX_ZOOM, z * AUTO_ZOOM_IN_FACTOR));
  }, []);

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
      setter((prev) => {
        const next = new Set(prev);
        const isExpanding = !next.has(key);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (isExpanding) setTimeout(zoomOutAuto, 0);
        else setTimeout(zoomInAuto, 0);
        return next;
      });
    },
    [zoomOutAuto, zoomInAuto]
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
      if (isExpanded) setTimeout(zoomInAuto, 0);
      else setTimeout(zoomOutAuto, 0);
      setExpandedKPIs((prev) => {
        const next = new Set(prev);
        if (next.has(kpi)) next.delete(kpi);
        else next.add(kpi);
        return next;
      });
    },
    [expandedKPIs, loadBreakdown, zoomOutAuto, zoomInAuto]
  );

  const sortedPillars = [...data.pillars].sort((a, b) => {
    const ai = pillarOrder.indexOf(a.pillar);
    const bi = pillarOrder.indexOf(b.pillar);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Fit entire diagram in viewport (no scroll); re-fit when container or content size changes
  const updateFitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const updateFit = () => {
      if (!container || !content) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const sw = content.scrollWidth || content.offsetWidth;
      const sh = content.scrollHeight || content.offsetHeight;
      if (sw <= 0 || sh <= 0) return;
      const rawScale = Math.min(cw / sw, ch / sh, 1);
      const scale = Math.max(rawScale * FIT_PADDING, MIN_FIT_SCALE);
      setFitScale(scale);
    };
    updateFitRef.current = updateFit;
    const runAfterLayout = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateFit);
        setTimeout(updateFit, 120);
        setTimeout(updateFit, 350);
      });
    };
    runAfterLayout();
    const ro = new ResizeObserver(runAfterLayout);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [data, expandedPillars, expandedObjectives, expandedTargets, expandedKPIs, breakdownCache, fitKey]);

  const effectiveScale = fitScale * zoomLevel;

  return (
    <div className="p-4 min-h-[400px] flex flex-col bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-emerald-200/50 dark:border-emerald-800/30">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-xs text-muted-foreground mr-2">Zoom</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setZoomLevel((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setZoomLevel((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setZoomLevel(1.7)}
          title="Reset zoom (170%)"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setFitKey((k) => k + 1)}
          title="Fit entire diagram in view"
        >
          <Maximize2 className="h-3.5 w-3.5 mr-1" />
          Fit
        </Button>
        <span className="text-xs text-muted-foreground ml-2">{Math.round(effectiveScale * 100)}%</span>
      </div>

      {/* Viewport: no scroll, whole visual fits */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden flex items-start justify-center"
        style={{ minHeight: 420 }}
      >
        <div
          ref={contentRef}
          className="origin-top transition-transform duration-300 ease-out"
          style={{
            transform: `scale(${effectiveScale})`,
            transformOrigin: 'top center',
            width: 'max-content',
            minWidth: 'max-content',
          }}
        >
          {/* Flowchart content - natural width so scale can fit to viewport */}
          <div className="flex flex-col items-center w-full">
        {/* Level 0: Root */}
        <div className="rounded-xl bg-emerald-600 text-white px-6 py-3 font-bold text-base shadow-lg text-center break-words max-w-full">
          Work Breakdown Structure
        </div>

        <ArrowDown className="bg-emerald-500/60" />

        {/* Level 1: Pillars in a row with space between */}
        <div className="flex flex-row flex-nowrap gap-10 lg:gap-16 justify-center items-start w-full pb-2">
          {sortedPillars.map((pillar) => {
            const pKey = pillarKey(pillar);
            const isPillarExpanded = expandedPillars.has(pKey);
            const hasChildren = pillar.objectives.length > 0;

            return (
              <div key={pKey} className="flex flex-col items-center flex-none min-w-[200px] w-max">
                <button
                  type="button"
                  onClick={() => hasChildren && toggle(setExpandedPillars, pKey)}
                  className={`rounded-xl px-4 py-2.5 font-semibold text-sm shadow-md w-full flex items-center justify-between gap-2 transition-colors break-words text-left min-w-0 ${
                    hasChildren
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                      : 'bg-emerald-600/80 text-white cursor-default'
                  }`}
                >
                  <span className="min-w-0 break-words">{pillar.pillar}</span>
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
                    <ArrowDown className="bg-emerald-400/50" />
                    <div className="flex flex-row flex-nowrap gap-4 justify-start items-start w-full pb-2">
                      {pillar.objectives.map((obj) => {
                        const oKey = objectiveKey(pillar, obj);
                        const isObjExpanded = expandedObjectives.has(oKey);
                        const hasTargets = obj.targets.length > 0;

                        return (
                          <div key={oKey} className="flex flex-col items-center flex-shrink-0 min-w-[220px] w-max">
                            <button
                              type="button"
                              onClick={() => hasTargets && toggle(setExpandedObjectives, oKey)}
                              className={`rounded-lg px-3 py-2 text-sm font-medium w-full flex items-center justify-between gap-2 border transition-colors break-words text-left min-w-0 ${
                                hasTargets
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400/50 text-foreground hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer'
                                  : 'bg-gray-100 dark:bg-gray-800/50 border-border text-foreground cursor-default'
                              }`}
                            >
                              <span className="min-w-0 break-words">
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
                                <ArrowDown className="bg-emerald-400/50" arrowColor="text-emerald-600 dark:text-emerald-400" />
                                <div className="flex flex-row flex-nowrap gap-3 justify-start items-start pb-2 w-full">
                                  {sortTargets(obj.targets).map((target) => {
                                    const tKey = targetKey(pillar, obj, target);
                                    const isTargetExpanded = expandedTargets.has(tKey);
                                    const hasKpis = target.kpis.length > 0;

                                    return (
                                      <div key={tKey} className="flex flex-col items-center flex-shrink-0 min-w-[200px] w-max">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            hasKpis && toggle(setExpandedTargets, tKey)
                                          }
                                          className={`rounded-lg px-3 py-2 text-xs font-medium w-full flex items-center justify-between gap-2 border transition-colors break-words text-left min-w-0 ${
                                            hasKpis
                                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400/50 text-foreground hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer'
                                              : 'bg-gray-100 dark:bg-gray-800/50 border-border text-muted-foreground cursor-default'
                                          }`}
                                        >
                                          <span className="min-w-0 break-words">
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
                                            <ArrowDown className="bg-emerald-400/40" arrowColor="text-emerald-600 dark:text-emerald-400" />
                                            <div className="flex flex-row flex-nowrap gap-2 justify-start items-start pb-2 w-full">
                                              {sortKPIs(target.kpis).map((kpi) => {
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
                                                    className="flex flex-col items-stretch flex-shrink-0 w-[200px] max-w-[200px]"
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={() => handleToggleBreakdown(kpi.kpi)}
                                                      className="rounded-lg px-3 py-2 text-xs font-medium w-full flex items-center justify-between gap-2 border transition-colors break-words text-left min-w-0 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400/50 text-foreground hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer"
                                                    >
                                                      <span className="min-w-0 break-words flex items-center gap-1.5">
                                                        <Target className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                        <BidirectionalText>
                                                          {kpi.kpi.replace(
                                                            /^\d+(\.\d+)*(\.\d+)?\s*/,
                                                            ''
                                                          ).trim() || kpi.kpi}
                                                        </BidirectionalText>
                                                        <span className="text-muted-foreground shrink-0">
                                                          ({kpi.annual_target.toLocaleString()})
                                                        </span>
                                                      </span>
                                                      <span className="shrink-0 text-muted-foreground">
                                                        {isKpiExpanded ? (
                                                          <ChevronDown className="h-3.5 w-3.5" />
                                                        ) : (
                                                          <ChevronRight className="h-3.5 w-3.5" />
                                                        )}
                                                      </span>
                                                    </button>

                                                    {isKpiExpanded && (
                                                      <>
                                                        <ArrowDown className="bg-emerald-400/40" arrowColor="text-emerald-600 dark:text-emerald-400" />
                                                        <div className="w-full max-w-full overflow-x-hidden overflow-y-auto rounded-lg bg-white dark:bg-gray-900/50 border border-emerald-200 dark:border-emerald-800/50 py-2 px-3 space-y-3 shadow-sm max-h-[280px]">
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
                                                          {hasData && cached && (() => {
                                                            const departmentsWithRASCI = getDepartmentsWithRASCI(cached.rasci);
                                                            const objectivesByDept = groupObjectivesByDepartment(cached.objectives);
                                                            if (departmentsWithRASCI.length === 0) {
                                                              return (
                                                                <div className="text-sm text-muted-foreground py-2">
                                                                  No RASCI assignments for this KPI.
                                                                </div>
                                                              );
                                                            }
                                                            return (
                                                              <div className="flex flex-col gap-3">
                                                                {departmentsWithRASCI.map(({ department: deptName, role: rasciLetter }) => {
                                                                  const objectives = objectivesByDept.get(deptName) ?? [];
                                                                  return (
                                                                    <div key={deptName} className="flex flex-col gap-1.5 min-w-0">
                                                                      <div className="flex items-center gap-2 font-medium text-xs flex-wrap">
                                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                                        <span className="text-foreground break-words">{deptName}</span>
                                                                        <span className="rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-400/50 px-1 py-0.5 text-[10px] font-semibold shrink-0">
                                                                          ({rasciLetter})
                                                                        </span>
                                                                      </div>
                                                                      {objectives.length > 0 ? (
                                                                        <ul className="space-y-1 pl-3 border-l border-emerald-200 dark:border-emerald-800/50">
                                                                          {objectives.map((obj) => (
                                                                            <li
                                                                              key={obj.id}
                                                                              className="flex flex-wrap items-center gap-1.5 rounded bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 px-2 py-1 text-xs"
                                                                            >
                                                                              <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                                                                              <span className="text-foreground break-words min-w-0">
                                                                                <BidirectionalText>{obj.activity}</BidirectionalText>
                                                                              </span>
                                                                              {(obj.type === 'Direct' || obj.type === 'In direct') && (
                                                                                <span
                                                                                  className={`shrink-0 text-[10px] font-medium px-1 py-0.5 rounded ${
                                                                                    obj.type === 'Direct'
                                                                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                                                  }`}
                                                                                >
                                                                                  {obj.type === 'Direct' ? 'D' : 'I'}
                                                                                </span>
                                                                              )}
                                                                            </li>
                                                                          ))}
                                                                        </ul>
                                                                      ) : (
                                                                        <p className="text-xs text-muted-foreground pl-3">No objectives</p>
                                                                      )}
                                                                    </div>
                                                                  );
                                                                })}
                                                              </div>
                                                            );
                                                          })()}
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
      </div>
    </div>
  );
}
