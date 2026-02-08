import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColumnFilter } from '@/components/ui/column-filter';
import { loadFilterState, saveFilterState, getListSelected, type TableFilterState } from '@/lib/tableFilterState';
import { Selector } from '@/components/ui/selector';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { createMainObjective, updateMainObjective, deleteMainObjective } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import type { MainPlanObjective } from '@/types/wig';
import { Edit2, Trash2, Plus, Table2, Sparkles, Filter } from 'lucide-react';
import MainPlanObjectiveFormModal from '@/components/wig/MainPlanObjectiveFormModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MainPlanTableProps {
  objectives: MainPlanObjective[];
  onUpdate: () => void;
  readOnly?: boolean;
}

// Helper function to extract or generate numbers from hierarchy
// Updated to allow patterns like 7.1.7 (three-level numbering)
function extractNumber(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match ? match[0] : '';
}

// Target to Objective number mapping (target number -> objective number)
// Based on the structure: targets 1.1, 1.2, 1.3 share objective, target 1.4 is different objective, etc.
const TARGET_TO_OBJECTIVE_MAP: Record<string, string> = {
  // Pillar 1 objectives
  '1.1': '1.1', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار
  '1.2': '1.2', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار (different target, same objective text)
  '1.3': '1.3', // تنمية قاعدة المتطوعين وتوسيع قاعدة الانتشار (different target, same objective text)
  '1.4': '1.4', // تعظيم الأثر المجتمعي لأنشطة المتطوعين
  '1.5': '1.5', // تعزيز تجربة المتطوعين ورفاهيتهم
  // Pillar 2
  '2.1': '2.1', // رفع حجم ومعدل مساهمة المؤسسة في المشروعات التنموية
  // Pillar 3
  '3.1': '3.1', // بناء صورة ذهنية قوية للمؤسسة
  // Pillar 4
  '4.1': '4.1', // بناء وإدارة شبكة علاقات استراتيجية فعّالة
  // Pillar 5
  '5.1': '5.1', // ترسيخ مكانة صناع الحياة...
  '5.2': '5.2', // تعزيز ريادة صُنّاع الحياة...
  '5.3': '5.3', // تعزيز وعي المجتمع المصري...
  '5.4': '5.4', // دوق ادنبرة...
  // Pillar 6
  '6.1': '6.1', // زيادة حجم التمويل المستدام
  // Pillar 7
  '7.1': '7.1', // تحسين الكفاءة الإدارية...
  // Pillar 8
  '8.1': '8.1', // قيادة التحول الرقمي...
  // Pillar 9
  '9.1': '9.1', // تطوير وتطبيق أنظمة...
};

// Generate hierarchical numbers based on position
function generateNumbers(objectives: MainPlanObjective[]): Map<number, { objNum: string; targetNum: string; kpiNum: string }> {
  const numbers = new Map<number, { objNum: string; targetNum: string; kpiNum: string }>();
  
  objectives.forEach((obj) => {
    // Extract target number from target field (e.g., "1.1" from "1.1 تنمية...")
    const targetNum = extractNumber(obj.target, /^\d+(\.\d+)?/) || '';
    
    // Objective number = target number (they match in this structure: 1.1, 1.2, 1.3, etc.)
    let objNum = targetNum;
    
    // If no target number, try to get from mapping or extract from objective text
    if (!objNum) {
      objNum = extractNumber(obj.objective, /^\d+(\.\d+)?/) || '';
    }
    
    // Extract KPI number from KPI field (e.g., "1.1.1" from "1.1.1 عدد...")
    const kpiNum = extractNumber(obj.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
    
    numbers.set(obj.id, {
      objNum: objNum,
      targetNum: targetNum,
      kpiNum: kpiNum,
    });
  });

  return numbers;
}

export default function MainPlanTable({ objectives, onUpdate, readOnly = false }: MainPlanTableProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [modalInitialData, setModalInitialData] = useState<Partial<MainPlanObjective> | undefined>(undefined);

  const MAIN_PLAN_FILTERS_KEY = 'main-plan-filters';
  const [tableFilterState, setTableFilterState] = useState<TableFilterState>(() =>
    loadFilterState(MAIN_PLAN_FILTERS_KEY)
  );
  const updateColumnFilter = useCallback((columnKey: string, state: TableFilterState[string]) => {
    setTableFilterState((prev) => {
      const next = { ...prev, [columnKey]: state };
      saveFilterState(MAIN_PLAN_FILTERS_KEY, next);
      return next;
    });
  }, []);

  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const numbers = generateNumbers(objectives);

  const startEdit = (obj: MainPlanObjective) => {
    setModalInitialData(obj);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      await deleteMainObjective(deletingId);
      toast({
        title: 'Success',
        description: 'Objective deleted successfully',
      });
      setDeletingId(null);
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete objective',
        variant: 'destructive',
      });
    }
  };

  const handleAdd = () => {
    setModalInitialData(undefined);
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleModalSave = async (data: Partial<MainPlanObjective>) => {
    try {
      if (modalMode === 'edit' && modalInitialData?.id) {
        await updateMainObjective(modalInitialData.id, data);
        toast({
          title: 'Success',
          description: 'Objective updated successfully',
        });
      } else {
        await createMainObjective({
          pillar: data.pillar!,
          objective: data.objective!,
          target: data.target!,
          kpi: data.kpi!,
          annual_target: data.annual_target || 0,
        });
        toast({
          title: 'Success',
          description: 'Objective created successfully',
        });
      }
      setIsModalOpen(false);
      setModalInitialData(undefined);
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save objective';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err; // Re-throw to let modal handle it
    }
  };

  // Get pillar color based on pillar name
  const getPillarColor = (pillar: string) => {
    if (pillar === 'Strategic Themes') {
      return 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10';
    } else if (pillar === 'Contributors') {
      return 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10';
    } else {
      return 'border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/10';
    }
  };

  // Calculate unique values for filters and combobox options
  const uniquePillars = Array.from(new Set(objectives.map(obj => obj.pillar))).sort();
  
  // Custom sort for objectives: single digits (1-9) before decimals (1.1, 1.2, etc.)
  const uniqueObjectives = Array.from(new Set(objectives.map(obj => obj.objective))).sort((a, b) => {
    // Extract numeric prefix from objective (e.g., "1" from "1 Objective text" or "1.1" from "1.1 Objective text")
    const extractNum = (text: string): { num: number; isDecimal: boolean; parts: number[] } => {
      const match = text.match(/^(\d+(?:\.\d+)*)/);
      if (!match) return { num: 0, isDecimal: false, parts: [] };
      const numStr = match[1];
      const parts = numStr.split('.').map(Number);
      const isDecimal = parts.length > 1;
      return { num: parts[0], isDecimal, parts };
    };
    
    const aNum = extractNum(a);
    const bNum = extractNum(b);
    
    // Single digits (1-9) come before decimals (1.1, 1.2, etc.)
    if (!aNum.isDecimal && bNum.isDecimal) return -1;
    if (aNum.isDecimal && !bNum.isDecimal) return 1;
    
    // Both are single digits or both are decimals - sort numerically
    if (aNum.parts.length === 0 && bNum.parts.length === 0) return a.localeCompare(b);
    if (aNum.parts.length === 0) return 1;
    if (bNum.parts.length === 0) return -1;
    
    // Compare parts numerically
    for (let i = 0; i < Math.max(aNum.parts.length, bNum.parts.length); i++) {
      const aVal = aNum.parts[i] || 0;
      const bVal = bNum.parts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    
    // If numbers are equal, sort alphabetically by text
    return a.localeCompare(b);
  });
  // For filter: extract text without number prefix
  const uniqueTargetsForFilter = Array.from(new Set(
    objectives.map(obj => obj.target.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim())
  )).filter(Boolean).sort();
  // For modal selector: use full target values (with number prefixes)
  const uniqueTargets = Array.from(new Set(objectives.map(obj => obj.target))).filter(Boolean).sort();
  const uniqueKPIs = Array.from(new Set(
    objectives.map(obj => obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim())
  )).filter(Boolean).sort();
  const uniqueAnnualTargets = Array.from(new Set(
    objectives.map(obj => obj.annual_target.toString())
  )).sort((a, b) => parseFloat(a) - parseFloat(b));

  const filteredObjectives = objectives.filter((obj) => {
    const targetText = obj.target.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
    const kpiText = obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
    const pillarList = getListSelected(tableFilterState, 'pillar');
    const objectiveList = getListSelected(tableFilterState, 'objective');
    const targetList = getListSelected(tableFilterState, 'target');
    const kpiList = getListSelected(tableFilterState, 'kpi');
    const annualTargetList = getListSelected(tableFilterState, 'annualTarget');
    const matchesPillar = pillarList.length === 0 || pillarList.includes(obj.pillar);
    const matchesObjective = objectiveList.length === 0 || objectiveList.includes(obj.objective);
    const matchesTarget = targetList.length === 0 || targetList.includes(targetText);
    const matchesKPI = kpiList.length === 0 || kpiList.includes(kpiText);
    const matchesAnnualTarget =
      annualTargetList.length === 0 ||
      annualTargetList.includes(obj.annual_target.toString());
    return (
      matchesPillar &&
      matchesObjective &&
      matchesTarget &&
      matchesKPI &&
      matchesAnnualTarget
    );
  });

  return (
    <>
      {!readOnly && (
        <div className="mb-6">
          <Button 
            type="button"
            onClick={handleAdd}
            className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Objective
          </Button>
        </div>
      )}

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10 hover:bg-primary/15 border-b-2 border-primary/20">
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">Pillar</span>
                    <ColumnFilter
                      columnKey="pillar"
                      columnLabel="Pillar"
                      filterId="main-pillar"
                      columnType="text"
                      uniqueValues={uniquePillars}
                      selectedValues={getListSelected(tableFilterState, 'pillar')}
                      onListChange={(selected) =>
                        updateColumnFilter('pillar', { mode: 'list', selectedValues: selected })
                      }
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">Objective</span>
                    <ColumnFilter
                      columnKey="objective"
                      columnLabel="Objective"
                      filterId="main-objective"
                      columnType="text"
                      uniqueValues={uniqueObjectives}
                      selectedValues={getListSelected(tableFilterState, 'objective')}
                      onListChange={(selected) =>
                        updateColumnFilter('objective', { mode: 'list', selectedValues: selected })
                      }
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                </TableHead>
                <TableHead className="font-bold text-foreground">Target #</TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">Target</span>
                    <ColumnFilter
                      columnKey="target"
                      columnLabel="Target"
                      filterId="main-target"
                      columnType="text"
                      uniqueValues={uniqueTargetsForFilter}
                      selectedValues={getListSelected(tableFilterState, 'target')}
                      onListChange={(selected) =>
                        updateColumnFilter('target', { mode: 'list', selectedValues: selected })
                      }
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                </TableHead>
                <TableHead className="font-bold text-foreground">KPI #</TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">KPI</span>
                    <ColumnFilter
                      columnKey="kpi"
                      columnLabel="KPI"
                      filterId="main-kpi"
                      columnType="text"
                      uniqueValues={uniqueKPIs}
                      selectedValues={getListSelected(tableFilterState, 'kpi')}
                      onListChange={(selected) =>
                        updateColumnFilter('kpi', { mode: 'list', selectedValues: selected })
                      }
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-bold text-foreground">Annual Target</span>
                    <ColumnFilter
                      columnKey="annualTarget"
                      columnLabel="Annual Target"
                      filterId="main-annual-target"
                      columnType="number"
                      uniqueValues={uniqueAnnualTargets}
                      selectedValues={getListSelected(tableFilterState, 'annualTarget')}
                      onListChange={(selected) =>
                        updateColumnFilter('annualTarget', { mode: 'list', selectedValues: selected })
                      }
                      openFilterId={openFilter}
                      onOpenFilterChange={setOpenFilter}
                      listOnly
                    />
                  </div>
                </TableHead>
                {!readOnly && (
                  <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
          <TableBody>

            {filteredObjectives
              .map((obj) => {
                // Extract numbers directly from fields (target and KPI have number prefixes)
                // Updated regex to allow three-level numbering like 7.1.7
                const targetNum = extractNumber(obj.target, /^\d+(\.\d+)*(\.\d+)?/) || '';
                const kpiNum = extractNumber(obj.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
                
                // Extract objective number - take only the first part (before decimal)
                // e.g., "1.1" -> "1", "2.1" -> "2"
                const objNumFull = extractNumber(obj.objective, /^\d+(\.\d+)*/) || '';
                const objNum = objNumFull ? objNumFull.split('.')[0] : '';
                
                // Clean text (remove numbers from start)
                // For objective: remove the full number prefix (e.g., "1.1") but keep the first number
                let objText = obj.objective.trim();
                if (objNumFull) {
                  // Remove the full number prefix (e.g., "1.1") and replace with just first number (e.g., "1")
                  objText = objText.replace(/^\d+(\.\d+)*\s*/, '').trim();
                  // Prepend the first number
                  objText = objNum ? `${objNum} ${objText}` : objText;
                }
                
                const targetText = obj.target.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
                const kpiText = obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
                
                return { obj, targetNum, kpiNum, objText, targetText, kpiText };
              })
              .sort((a, b) => {
                // Sort by target number (e.g., "1.1" < "1.2" < "2.1")
                if (!a.targetNum && !b.targetNum) return 0;
                if (!a.targetNum) return 1;
                if (!b.targetNum) return -1;
                
                const aParts = a.targetNum.split('.').map(Number);
                const bParts = b.targetNum.split('.').map(Number);
                
                for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                  const aVal = aParts[i] || 0;
                  const bVal = bParts[i] || 0;
                  if (aVal !== bVal) return aVal - bVal;
                }
                
                // If target numbers are equal, sort by KPI number
                if (!a.kpiNum && !b.kpiNum) return 0;
                if (!a.kpiNum) return 1;
                if (!b.kpiNum) return -1;
                
                const aKpiParts = a.kpiNum.split('.').map(Number);
                const bKpiParts = b.kpiNum.split('.').map(Number);
                
                for (let i = 0; i < Math.max(aKpiParts.length, bKpiParts.length); i++) {
                  const aVal = aKpiParts[i] || 0;
                  const bVal = bKpiParts[i] || 0;
                  if (aVal !== bVal) return aVal - bVal;
                }
                
                return 0;
              })
              .map(({ obj, targetNum, kpiNum, objText, targetText, kpiText }) => {
                const pillarColor = getPillarColor(obj.pillar);
                return (
                  <TableRow 
                    key={obj.id} 
                    className={`border-l-4 ${pillarColor} hover:bg-primary/5 transition-colors duration-200`}
                    onKeyDownCapture={(e) => {
                      // Stop propagation to prevent table navigation when typing dots in number input fields
                      // Don't prevent default - let the browser type the character naturally
                      if (e.key === '.' && e.target instanceof HTMLInputElement) {
                        const input = e.target as HTMLInputElement;
                        // Only handle if it's a Target # or KPI # input (check by aria-label or placeholder)
                        if (input.getAttribute('aria-label')?.includes('number') || 
                            input.placeholder?.match(/^\d+\.\d+/)) {
                          e.stopPropagation();
                          e.stopImmediatePropagation();
                        }
                      }
                    }}
                  >
                      <TableCell className="font-semibold">
                        <Badge variant="outline" className="border-primary/30 bg-primary/5">
                          {obj.pillar}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <BidirectionalText>{objText || obj.objective}</BidirectionalText>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs font-bold">
                          {targetNum}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <BidirectionalText>{targetText || obj.target}</BidirectionalText>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs font-semibold border-accent/50">
                          {kpiNum}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <BidirectionalText>{kpiText || obj.kpi}</BidirectionalText>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-gradient-to-r from-primary to-accent text-white font-semibold">
                          {obj.annual_target.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!readOnly && (
                          <div className="flex justify-end gap-2">
                            <Button 
                              type="button"
                              size="sm" 
                              variant="outline" 
                              onClick={() => startEdit(obj)}
                              className="hover:bg-primary/10 hover:border-primary/50 transition-all"
                              aria-label={`Edit objective ${kpiNum || obj.id}`}
                              title="Edit objective"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              type="button"
                              size="sm" 
                              variant="outline" 
                              onClick={() => setDeletingId(obj.id)}
                              className="hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive transition-all"
                              aria-label={`Delete objective ${kpiNum || obj.id}`}
                              title="Delete objective"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        </div>
      </Card>

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Objective</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this objective? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Plan Objective Form Modal */}
      <MainPlanObjectiveFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        mode={modalMode}
        initialData={modalInitialData}
        onSave={handleModalSave}
        uniquePillars={uniquePillars}
        uniqueObjectives={uniqueObjectives}
        uniqueTargets={uniqueTargets}
      />
    </>
  );
}

