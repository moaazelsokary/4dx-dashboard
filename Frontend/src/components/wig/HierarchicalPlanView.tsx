import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Target, TrendingUp, Layers, BarChart3, Sparkles } from 'lucide-react';
import DepartmentBreakdown from './DepartmentBreakdown';
import BidirectionalText from '@/components/ui/BidirectionalText';
import type { HierarchicalPlan } from '@/types/wig';

interface HierarchicalPlanViewProps {
  data: HierarchicalPlan;
}

// Helper to extract numbers from text
function extractNumber(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[0] : '';
}

// Target to Objective number mapping (target number -> objective number)
const TARGET_TO_OBJECTIVE_MAP: Record<string, string> = {
  '1.1': '1.1',
  '1.2': '1.2',
  '1.3': '1.3',
  '1.4': '1.4',
  '1.5': '1.5',
  '2.1': '2.1',
  '3.1': '3.1',
  '4.1': '4.1',
  '5.1': '5.1',
  '5.2': '5.2',
  '5.3': '5.3',
  '5.4': '5.4',
  '6.1': '6.1',
  '7.1': '7.1',
  '8.1': '8.1',
  '9.1': '9.1',
};

// Generate hierarchical numbers
function generateHierarchicalNumbers(data: HierarchicalPlan) {
  const objNums = new Map<string, string>();
  const targetNums = new Map<string, string>();
  const kpiNums = new Map<string, string>();

  data.pillars.forEach((pillar) => {
    pillar.objectives.forEach((obj) => {
      const objKey = `${pillar.pillar}|${obj.objective}`;
      
      // Get objective number from first target's number
      let objNum = '';
      if (obj.targets.length > 0) {
        const firstTarget = obj.targets[0];
        const targetNum = extractNumber(firstTarget.target, /^\d+(\.\d+)?/);
        if (targetNum) {
          objNum = TARGET_TO_OBJECTIVE_MAP[targetNum] || targetNum;
        }
      }
      
      if (!objNum) {
        // Fallback: extract from objective text
        objNum = extractNumber(obj.objective, /^\d+(\.\d+)?/);
      }
      
      objNums.set(objKey, objNum || '');
      
      obj.targets.forEach((target) => {
        const targetKey = `${objKey}|${target.target}`;
        const extractedTargetNum = extractNumber(target.target, /^\d+(\.\d+)?/);
        targetNums.set(targetKey, extractedTargetNum || '');
        
        target.kpis.forEach((kpi) => {
          const kpiKey = `${targetKey}|${kpi.kpi}`;
          const extractedKpiNum = extractNumber(kpi.kpi, /^\d+(\.\d+)*(\.\d+)?/);
          kpiNums.set(kpiKey, extractedKpiNum || '');
        });
      });
    });
  });

  return { objNums, targetNums, kpiNums };
}

export default function HierarchicalPlanView({ data }: HierarchicalPlanViewProps) {
  const [expandedKPIs, setExpandedKPIs] = useState<Set<string>>(new Set());
  const numbers = generateHierarchicalNumbers(data);

  const toggleKPI = (kpiId: string) => {
    const newExpanded = new Set(expandedKPIs);
    if (newExpanded.has(kpiId)) {
      newExpanded.delete(kpiId);
    } else {
      newExpanded.add(kpiId);
    }
    setExpandedKPIs(newExpanded);
  };

  const getObjNum = (pillar: string, objective: string): string => {
    const objKey = `${pillar}|${objective}`;
    return numbers.objNums.get(objKey) || '';
  };

  const getTargetNum = (pillar: string, objective: string, target: string): string => {
    const objKey = `${pillar}|${objective}`;
    const targetKey = `${objKey}|${target}`;
    return numbers.targetNums.get(targetKey) || '';
  };

  const getKpiNum = (pillar: string, objective: string, target: string, kpi: string): string => {
    const objKey = `${pillar}|${objective}`;
    const targetKey = `${objKey}|${target}`;
    const kpiKey = `${targetKey}|${kpi}`;
    return numbers.kpiNums.get(kpiKey) || '';
  };

  // Helper function to sort by number strings (e.g., "1.1", "1.2", "2.1")
  const sortByNumber = (a: string, b: string): number => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    
    return 0;
  };

  // Get pillar color scheme based on pillar type
  const getPillarColors = (pillar: string) => {
    if (pillar === 'Strategic Themes') {
      return {
        gradient: 'from-blue-500/20 via-blue-400/10 to-indigo-500/20',
        border: 'border-blue-400/30',
        borderLeft: 'border-l-blue-500',
        bg: 'bg-blue-50/50 dark:bg-blue-950/20',
        text: 'text-blue-700 dark:text-blue-300',
        icon: 'text-blue-600 dark:text-blue-400',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300 dark:border-blue-700',
        hoverBorder: 'hover:border-blue-400',
      };
    } else if (pillar === 'Contributors') {
      return {
        gradient: 'from-emerald-500/20 via-emerald-400/10 to-teal-500/20',
        border: 'border-emerald-400/30',
        borderLeft: 'border-l-emerald-500',
        bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
        text: 'text-emerald-700 dark:text-emerald-300',
        icon: 'text-emerald-600 dark:text-emerald-400',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        hoverBorder: 'hover:border-emerald-400',
      };
    } else {
      return {
        gradient: 'from-purple-500/20 via-purple-400/10 to-pink-500/20',
        border: 'border-purple-400/30',
        borderLeft: 'border-l-purple-500',
        bg: 'bg-purple-50/50 dark:bg-purple-950/20',
        text: 'text-purple-700 dark:text-purple-300',
        icon: 'text-purple-600 dark:text-purple-400',
        badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        hoverBorder: 'hover:border-purple-400',
      };
    }
  };

  // Sort pillars to ensure correct order: Strategic Themes, Contributors, Strategic Enablers
  const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];
  const sortedPillars = [...data.pillars].sort((a, b) => {
    const aIndex = pillarOrder.indexOf(a.pillar);
    const bIndex = pillarOrder.indexOf(b.pillar);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="space-y-6 p-2">
      {sortedPillars.map((pillar, pillarIndex) => {
        // Sort objectives by their target numbers
        const sortedObjectives = [...pillar.objectives].sort((a, b) => {
          const aFirstTarget = a.targets[0]?.target || '';
          const bFirstTarget = b.targets[0]?.target || '';
          const aTargetNum = extractNumber(aFirstTarget, /^\d+(\.\d+)?/) || '';
          const bTargetNum = extractNumber(bFirstTarget, /^\d+(\.\d+)?/) || '';
          return sortByNumber(aTargetNum, bTargetNum);
        });

        const colors = getPillarColors(pillar.pillar);
        const totalKPIs = sortedObjectives.reduce((sum, obj) => 
          sum + obj.targets.reduce((s, t) => s + t.kpis.length, 0), 0
        );

        return (
          <Card 
            key={pillarIndex} 
            className={`border-2 ${colors.border} bg-gradient-to-br ${colors.gradient} shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden relative`}
          >
            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-white/20 to-transparent rounded-full blur-3xl"></div>
            </div>
            
            <Accordion type="single" collapsible className="w-full relative z-10">
              <AccordionItem value={`pillar-${pillarIndex}`} className="border-none">
                <AccordionTrigger className="px-6 py-5 hover:no-underline group">
                  <div className="flex items-center gap-4 w-full">
                    <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border} group-hover:scale-110 transition-transform duration-200`}>
                      <Layers className={`h-6 w-6 ${colors.icon}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <h2 className={`text-2xl font-bold ${colors.text} mb-1`}>
                        <BidirectionalText>{pillar.pillar}</BidirectionalText>
                      </h2>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className={colors.badge}>
                          <Target className="h-3 w-3 mr-1" />
                          {pillar.objectives.length} Objectives
                        </Badge>
                        <Badge variant="outline" className="border-current/30">
                          <BarChart3 className="h-3 w-3 mr-1" />
                          {totalKPIs} KPIs
                        </Badge>
                      </div>
                    </div>
                    <Sparkles className={`h-5 w-5 ${colors.icon} opacity-50 group-hover:opacity-100 transition-opacity`} />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="space-y-4">
                    {sortedObjectives.map((objective, objIndex) => {
                      const objNum = getObjNum(pillar.pillar, objective.objective);
                      const objText = objective.objective.replace(/^\d+(\.\d+)?\s*/, '') || objective.objective;
                      
                      // Sort targets by their numbers
                      const sortedTargets = [...objective.targets].sort((a, b) => {
                        const aTargetNum = extractNumber(a.target, /^\d+(\.\d+)?/) || '';
                        const bTargetNum = extractNumber(b.target, /^\d+(\.\d+)?/) || '';
                        return sortByNumber(aTargetNum, bTargetNum);
                      });

                      const objKPIs = sortedTargets.reduce((sum, t) => sum + t.kpis.length, 0);

                      return (
                        <Card 
                          key={objIndex} 
                          className={`border-l-4 ${colors.borderLeft} bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm hover:shadow-md transition-all duration-200 group`}
                        >
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`objective-${pillarIndex}-${objIndex}`} className="border-none">
                              <AccordionTrigger className="px-5 py-4 hover:no-underline group">
                                <div className="flex items-center gap-3 w-full">
                                  <div className={`px-3 py-1.5 rounded-lg ${colors.bg} border ${colors.border} font-mono text-sm font-bold ${colors.text} group-hover:scale-105 transition-transform`}>
                                    {objNum}
                                  </div>
                                  <div className="flex-1 text-left">
                                    <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                                      <BidirectionalText>{objText}</BidirectionalText>
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                                      <Target className="h-3 w-3 mr-1" />
                                      {objective.targets.length} Targets
                                    </Badge>
                                    <Badge variant="outline" className="border-primary/30">
                                      {objKPIs} KPIs
                                    </Badge>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-5 pb-5">
                                <div className="space-y-3">
                                  {sortedTargets.map((target, targetIndex) => {
                                    const targetNum = getTargetNum(pillar.pillar, objective.objective, target.target);
                                    const targetText = target.target.replace(/^\d+(\.\d+)?\s*/, '') || target.target;
                                    
                                    // Sort KPIs by their numbers
                                    const sortedKPIs = [...target.kpis].sort((a, b) => {
                                      const aKpiNum = extractNumber(a.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
                                      const bKpiNum = extractNumber(b.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
                                      return sortByNumber(aKpiNum, bKpiNum);
                                    });

                                    return (
                                      <Card 
                                        key={targetIndex} 
                                        className={`bg-gradient-to-r ${colors.bg} border ${colors.border} transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-lg`}
                                      >
                                        <Accordion type="single" collapsible>
                                          <AccordionItem value={`target-${pillarIndex}-${objIndex}-${targetIndex}`} className="border-none">
                                            <AccordionTrigger className="px-4 py-3 hover:no-underline group">
                                              <div className="flex items-center gap-3 w-full">
                                                <div className={`px-2.5 py-1 rounded-md ${colors.bg} border ${colors.border} font-mono text-xs font-semibold ${colors.text}`}>
                                                  {targetNum}
                                                </div>
                                                <div className="flex-1 text-left">
                                                  <h4 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
                                                    <BidirectionalText>{targetText}</BidirectionalText>
                                                  </h4>
                                                </div>
                                                <Badge variant="outline" className="border-primary/30 bg-white/50 dark:bg-gray-800/50">
                                                  <TrendingUp className="h-3 w-3 mr-1" />
                                                  {target.kpis.length} KPIs
                                                </Badge>
                                              </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-4 pb-4">
                                              <div className="space-y-3">
                                                {sortedKPIs.map((kpi, kpiIndex) => {
                                                  const kpiId = `kpi-${pillarIndex}-${objIndex}-${targetIndex}-${kpiIndex}`;
                                                  const isExpanded = expandedKPIs.has(kpiId);
                                                  const kpiNum = getKpiNum(pillar.pillar, objective.objective, target.target, kpi.kpi);
                                                  const kpiText = kpi.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || kpi.kpi;
                                                  return (
                                                    <Card 
                                                      key={kpiIndex} 
                                                      className={`border-l-4 ${colors.borderLeft} bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:shadow-lg transition-all duration-200 group`}
                                                    >
                                                      <div className="p-4">
                                                        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                                                          <div className="flex items-center gap-3 flex-wrap flex-1">
                                                            <div className={`px-2 py-1 rounded ${colors.bg} border ${colors.border} font-mono text-xs font-bold ${colors.text}`}>
                                                              {kpiNum}
                                                            </div>
                                                            <h5 className="font-semibold text-foreground group-hover:text-primary transition-colors flex-1 min-w-[200px]">
                                                              <BidirectionalText>{kpiText}</BidirectionalText>
                                                            </h5>
                                                            <Badge className={`${colors.badge} border font-medium`}>
                                                              <Target className="h-3 w-3 mr-1" />
                                                              {kpi.annual_target.toLocaleString()}
                                                            </Badge>
                                                          </div>
                                                          <button
                                                            onClick={() => toggleKPI(kpiId)}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.bg} border ${colors.border} text-sm font-medium ${colors.text} hover:scale-105 transition-all duration-200 group/btn`}
                                                          >
                                                            {isExpanded ? (
                                                              <>
                                                                <ChevronDown className="h-4 w-4 group-hover/btn:rotate-180 transition-transform" />
                                                                Hide Breakdown
                                                              </>
                                                            ) : (
                                                              <>
                                                                <ChevronRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                                                                Show Breakdown
                                                              </>
                                                            )}
                                                          </button>
                                                        </div>
                                                        {isExpanded && (
                                                          <div className="mt-4 pt-4 border-t border-border/50 animate-in slide-in-from-top-2 duration-300">
                                                            <DepartmentBreakdown kpi={kpi.kpi} annualTarget={kpi.annual_target} />
                                                          </div>
                                                        )}
                                                      </div>
                                                    </Card>
                                                  );
                                                })}
                                              </div>
                                            </AccordionContent>
                                          </AccordionItem>
                                        </Accordion>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        );
      })}
    </div>
  );
}

