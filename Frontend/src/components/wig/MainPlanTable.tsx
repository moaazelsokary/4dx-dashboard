import { useState, useEffect } from 'react';
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
import { Selector } from '@/components/ui/selector';
import { createMainObjective, updateMainObjective, deleteMainObjective } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import type { MainPlanObjective } from '@/types/wig';
import { Edit2, Save, X, Trash2, Plus, Table2, Sparkles, Filter, Search } from 'lucide-react';
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editData, setEditData] = useState<Partial<MainPlanObjective>>({});
  const [newData, setNewData] = useState<Partial<MainPlanObjective>>({
    pillar: '',
    objective: '',
    target: '',
    kpi: '',
    annual_target: 0,
  });

  // Filter states for Excel-like filtering
  const [filters, setFilters] = useState<{
    pillar: string[];
    objective: string[];
    target: string[];
    kpi: string[];
    annualTarget: string[];
  }>({
    pillar: [],
    objective: [],
    target: [],
    kpi: [],
    annualTarget: [],
  });

  // Track which filter popover is currently open
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const numbers = generateNumbers(objectives);

  const startEdit = (obj: MainPlanObjective) => {
    setEditingId(obj.id);
    setEditData({ ...obj });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingId) return;

    try {
      const updated = await updateMainObjective(editingId, editData);
      toast({
        title: 'Success',
        description: 'Objective updated successfully',
      });
      setEditingId(null);
      setEditData({});
      // Refresh data without showing loading spinner
      onUpdate();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update objective',
        variant: 'destructive',
      });
    }
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

  const handleAdd = async () => {
    if (!newData.pillar || !newData.objective || !newData.target || !newData.kpi || newData.annual_target === undefined || newData.annual_target === null) {
      toast({
        title: 'Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createMainObjective({
        pillar: newData.pillar!,
        objective: newData.objective!,
        target: newData.target!,
        kpi: newData.kpi!,
        annual_target: parseFloat(newData.annual_target!.toString()) || 0,
      });
      toast({
        title: 'Success',
        description: 'Objective created successfully',
      });
      setIsAdding(false);
      setNewData({
        pillar: '',
        objective: '',
        target: '',
        kpi: '',
        annual_target: 0,
      });
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create objective';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      console.error('Error creating objective:', err);
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
  const uniqueObjectives = Array.from(new Set(objectives.map(obj => obj.objective))).sort();
  // Updated regex to allow three-level numbering like 7.1.7
  const uniqueTargets = Array.from(new Set(
    objectives.map(obj => obj.target.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim())
  )).filter(Boolean).sort();
  const uniqueKPIs = Array.from(new Set(
    objectives.map(obj => obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim())
  )).filter(Boolean).sort();
  const uniqueAnnualTargets = Array.from(new Set(
    objectives.map(obj => obj.annual_target.toString())
  )).sort((a, b) => parseFloat(a) - parseFloat(b));

  // Filter objectives based on selected filters
  const filteredObjectives = objectives.filter((obj) => {
    // Updated regex to allow three-level numbering like 7.1.7
    const targetText = obj.target.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
    const kpiText = obj.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '').trim();
    
    const matchesPillar = filters.pillar.length === 0 || filters.pillar.includes(obj.pillar);
    const matchesObjective = filters.objective.length === 0 || filters.objective.includes(obj.objective);
    const matchesTarget = filters.target.length === 0 || filters.target.includes(targetText);
    const matchesKPI = filters.kpi.length === 0 || filters.kpi.includes(kpiText);
    const matchesAnnualTarget = filters.annualTarget.length === 0 || filters.annualTarget.includes(obj.annual_target.toString());

    return matchesPillar && matchesObjective && matchesTarget && matchesKPI && matchesAnnualTarget;
  });

  const toggleFilterValue = (filterKey: keyof typeof filters, value: string) => {
    const currentValues = filters[filterKey];
    if (currentValues.includes(value)) {
      setFilters({ ...filters, [filterKey]: currentValues.filter(v => v !== value) });
    } else {
      setFilters({ ...filters, [filterKey]: [...currentValues, value] });
    }
  };

  const clearFilter = (filterKey: keyof typeof filters) => {
    setFilters({ ...filters, [filterKey]: [] });
  };

  // Excel-like filter component
  const ExcelFilter = ({ 
    column, 
    uniqueValues, 
    selectedValues, 
    onToggle, 
    onClear,
    getLabel,
    filterId
  }: { 
    column: string;
    uniqueValues: string[];
    selectedValues: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
    getLabel?: (value: string) => string;
    filterId: string;
  }) => {
    const open = openFilter === filterId;
    const [tempSelections, setTempSelections] = useState<string[]>(selectedValues);
    const [searchTerm, setSearchTerm] = useState('');
    
    const hasFilter = selectedValues.length > 0;
    
    // Update temp selections when popover opens or selectedValues change
    useEffect(() => {
      if (open) {
        setTempSelections(selectedValues);
      }
    }, [open, selectedValues]);
    
    const handleOpenChange = (newOpen: boolean) => {
      if (newOpen) {
        setOpenFilter(filterId);
      } else {
        setOpenFilter(null);
      }
    };
    
    // Filter values based on search term
    const filteredValues = uniqueValues.filter(value => {
      const label = getLabel ? getLabel(value) : value;
      return label.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    const handleToggle = (value: string) => {
      if (tempSelections.includes(value)) {
        setTempSelections(tempSelections.filter(v => v !== value));
      } else {
        setTempSelections([...tempSelections, value]);
      }
    };
    
    const handleSelectAll = () => {
      if (tempSelections.length === filteredValues.length) {
        // Deselect all filtered values
        setTempSelections(tempSelections.filter(v => !filteredValues.includes(v)));
      } else {
        // Select all filtered values
        const newSelections = [...tempSelections];
        filteredValues.forEach(value => {
          if (!newSelections.includes(value)) {
            newSelections.push(value);
          }
        });
        setTempSelections(newSelections);
      }
    };
    
    const handleApply = () => {
      // Apply temporary selections
      const currentSet = new Set(selectedValues);
      const tempSet = new Set(tempSelections);
      
      // Remove values that are no longer selected
      currentSet.forEach(value => {
        if (!tempSet.has(value)) {
          onToggle(value); // Toggle to remove
        }
      });
      
      // Add new values
      tempSet.forEach(value => {
        if (!currentSet.has(value)) {
          onToggle(value); // Toggle to add
        }
      });
      
      handleOpenChange(false);
      setSearchTerm('');
    };
    
    const handleClear = () => {
      setTempSelections([]);
      onClear();
      handleOpenChange(false);
      setSearchTerm('');
    };
    
    const allFilteredSelected = filteredValues.length > 0 && filteredValues.every(v => tempSelections.includes(v));
    
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${hasFilter ? 'text-primary' : ''}`}
            aria-label={`Filter ${column}`}
            title={`Filter ${column}`}
          >
            <Filter className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Filter by {column}</span>
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleClear}
                >
                  Clear
                </Button>
              )}
            </div>
            <Separator />
            {/* Search Input */}
            <div className="px-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>
            </div>
            {filteredValues.length > 0 && (
              <div className="px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs justify-start"
                  onClick={handleSelectAll}
                >
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            )}
            <Separator />
            <ScrollArea className="h-64">
              <div className="p-2 space-y-2">
                {filteredValues.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-2">
                    {searchTerm ? 'No values match your search' : 'No values available'}
                  </div>
                ) : (
                  filteredValues.map((value) => {
                    const label = getLabel ? getLabel(value) : value;
                    const isChecked = tempSelections.includes(value);
                    return (
                      <div key={value} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`filter-${column}-${value}`}
                          checked={isChecked}
                          onCheckedChange={() => handleToggle(value)}
                        />
                        <label
                          htmlFor={`filter-${column}-${value}`}
                          className="text-sm cursor-pointer flex-1 truncate"
                          title={label}
                        >
                          {label}
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            <Separator />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="text-xs text-muted-foreground">
                {tempSelections.length} of {uniqueValues.length} selected
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
                    handleOpenChange(false);
                    setTempSelections(selectedValues);
                    setSearchTerm('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleApply}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <>
      {!readOnly && (
        <div className="mb-6">
          <Button 
            type="button"
            onClick={() => setIsAdding(true)}
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
                    <ExcelFilter
                      filterId="main-pillar"
                      column="Pillar"
                      uniqueValues={uniquePillars}
                      selectedValues={filters.pillar}
                      onToggle={(value) => toggleFilterValue('pillar', value)}
                      onClear={() => clearFilter('pillar')}
                    />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">Objective</span>
                    <ExcelFilter
                      filterId="main-objective"
                      column="Objective"
                      uniqueValues={uniqueObjectives}
                      selectedValues={filters.objective}
                      onToggle={(value) => toggleFilterValue('objective', value)}
                      onClear={() => clearFilter('objective')}
                    />
                  </div>
                </TableHead>
                <TableHead className="font-bold text-foreground">Target #</TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">Target</span>
                    <ExcelFilter
                      filterId="main-target"
                      column="Target"
                      uniqueValues={uniqueTargets}
                      selectedValues={filters.target}
                      onToggle={(value) => toggleFilterValue('target', value)}
                      onClear={() => clearFilter('target')}
                    />
                  </div>
                </TableHead>
                <TableHead className="font-bold text-foreground">KPI #</TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">KPI</span>
                    <ExcelFilter
                      filterId="main-kpi"
                      column="KPI"
                      uniqueValues={uniqueKPIs}
                      selectedValues={filters.kpi}
                      onToggle={(value) => toggleFilterValue('kpi', value)}
                      onClear={() => clearFilter('kpi')}
                    />
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-bold text-foreground">Annual Target</span>
                    <ExcelFilter
                      filterId="main-annual-target"
                      column="Annual Target"
                      uniqueValues={uniqueAnnualTargets}
                      selectedValues={filters.annualTarget}
                      onToggle={(value) => toggleFilterValue('annualTarget', value)}
                      onClear={() => clearFilter('annualTarget')}
                    />
                  </div>
                </TableHead>
                {!readOnly && (
                  <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow
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
                <TableCell>
                  <Select
                    value={newData.pillar || ''}
                    onValueChange={(value) => setNewData({ ...newData, pillar: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Pillar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Strategic Themes">Strategic Themes</SelectItem>
                      <SelectItem value="Contributors">Contributors</SelectItem>
                      <SelectItem value="Strategic Enablers">Strategic Enablers</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Selector
                    options={uniqueObjectives}
                    value={newData.objective || ''}
                    onValueChange={(value) => setNewData({ ...newData, objective: value })}
                    placeholder="Select or type objective..."
                    allowCustom={true}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={extractNumber(newData.target || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                    onChange={(e) => {
                      // Allow dots in the number (e.g., 1.2)
                      const num = e.target.value.replace(/[^\d.]/g, '');
                      const currentTarget = newData.target || '';
                      const targetText = currentTarget.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                      setNewData({ ...newData, target: num ? `${num} ${targetText}` : targetText });
                    }}
                    onKeyDown={(e) => {
                      // Stop propagation to prevent table navigation, but allow the dot to be typed
                      if (e.key === '.') {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        // Don't prevent default - let browser type the dot naturally
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Prevent table navigation when typing dots
                      if (e.data === '.') {
                        e.stopPropagation();
                      }
                    }}
                    placeholder="1.2"
                    className="w-20"
                    aria-label="Target number"
                  />
                </TableCell>
                <TableCell>
                  <Selector
                    options={uniqueTargets}
                    value={newData.target?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                    onValueChange={(value) => {
                      const num = extractNumber(newData.target || '', /^\d+(\.\d+)*(\.\d+)?/);
                      setNewData({ ...newData, target: num ? `${num} ${value}` : value });
                    }}
                    placeholder="Select or type target..."
                    allowCustom={true}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={extractNumber(newData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                    onChange={(e) => {
                      // Allow dots in the number (e.g., 1.1.3)
                      const num = e.target.value.replace(/[^\d.]/g, '');
                      const currentKpi = newData.kpi || '';
                      const kpiText = currentKpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                      setNewData({ ...newData, kpi: num ? `${num} ${kpiText}` : kpiText });
                    }}
                    onKeyDown={(e) => {
                      // Stop propagation to prevent table navigation, but allow the dot to be typed
                      if (e.key === '.') {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        // Don't prevent default - let browser type the dot naturally
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Prevent table navigation when typing dots
                      if (e.data === '.') {
                        e.stopPropagation();
                      }
                    }}
                    placeholder="1.1.3"
                    className="w-20"
                    aria-label="KPI number"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newData.kpi?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                    onChange={(e) => {
                      const num = extractNumber(newData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/);
                      setNewData({ ...newData, kpi: num ? `${num} ${e.target.value}` : e.target.value });
                    }}
                    placeholder="KPI"
                    aria-label="KPI description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={newData.annual_target || ''}
                    onChange={(e) => setNewData({ ...newData, annual_target: parseFloat(e.target.value) || 0 })}
                    placeholder="Annual Target"
                    className="text-right"
                    aria-label="Annual target"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" onClick={handleAdd} aria-label="Save new objective">
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setIsAdding(false)} aria-label="Cancel adding objective">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {filteredObjectives
              .map((obj) => {
                // Extract numbers directly from fields (target and KPI have number prefixes)
                // Updated regex to allow three-level numbering like 7.1.7
                const targetNum = extractNumber(obj.target, /^\d+(\.\d+)*(\.\d+)?/) || '';
                const kpiNum = extractNumber(obj.kpi, /^\d+(\.\d+)*(\.\d+)?/) || '';
                
                // Clean text (remove numbers from start)
                // Objective doesn't have a number prefix in the database
                const objText = obj.objective.trim();
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
                    {editingId === obj.id ? (
                    <>
                      <TableCell>
                        <Select
                          value={editData.pillar || ''}
                          onValueChange={(value) => setEditData({ ...editData, pillar: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Pillar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Strategic Themes">Strategic Themes</SelectItem>
                            <SelectItem value="Contributors">Contributors</SelectItem>
                            <SelectItem value="Strategic Enablers">Strategic Enablers</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Selector
                          options={uniqueObjectives}
                          value={editData.objective || ''}
                          onValueChange={(value) => setEditData({ ...editData, objective: value })}
                          placeholder="Select or type objective..."
                          allowCustom={true}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={extractNumber(editData.target || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                          onChange={(e) => {
                            // Allow dots in the number (e.g., 1.2)
                            const num = e.target.value.replace(/[^\d.]/g, '');
                            const currentTarget = editData.target || '';
                            const targetText = currentTarget.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                            setEditData({ ...editData, target: num ? `${num} ${targetText}` : targetText });
                          }}
                          onKeyDown={(e) => {
                            // Stop propagation to prevent table navigation, but allow the dot to be typed
                            if (e.key === '.') {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                              // Don't prevent default - let browser type the dot naturally
                            }
                          }}
                          onBeforeInput={(e) => {
                            // Prevent table navigation when typing dots
                            if (e.data === '.') {
                              e.stopPropagation();
                            }
                          }}
                          className="w-20"
                          placeholder="1.2"
                          aria-label="Edit target number"
                        />
                      </TableCell>
                      <TableCell>
                        <Selector
                          options={uniqueTargets}
                          value={editData.target?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                          onValueChange={(value) => {
                            const num = extractNumber(editData.target || '', /^\d+(\.\d+)*(\.\d+)?/);
                            setEditData({ ...editData, target: num ? `${num} ${value}` : value });
                          }}
                          placeholder="Select or type target..."
                          allowCustom={true}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={extractNumber(editData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/) || ''}
                          onChange={(e) => {
                            // Allow dots in the number (e.g., 1.1.3)
                            const num = e.target.value.replace(/[^\d.]/g, '');
                            const currentKpi = editData.kpi || '';
                            const kpiText = currentKpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '');
                            setEditData({ ...editData, kpi: num ? `${num} ${kpiText}` : kpiText });
                          }}
                          onKeyDown={(e) => {
                            // Stop propagation to prevent table navigation, but allow the dot to be typed
                            if (e.key === '.') {
                              e.stopPropagation();
                              e.stopImmediatePropagation();
                              // Don't prevent default - let browser type the dot naturally
                            }
                          }}
                          onBeforeInput={(e) => {
                            // Prevent table navigation when typing dots
                            if (e.data === '.') {
                              e.stopPropagation();
                            }
                          }}
                          className="w-20"
                          placeholder="1.1.3"
                          aria-label="Edit KPI number"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editData.kpi?.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || ''}
                          onChange={(e) => {
                            const num = extractNumber(editData.kpi || '', /^\d+(\.\d+)*(\.\d+)?/);
                            setEditData({ ...editData, kpi: num ? `${num} ${e.target.value}` : e.target.value });
                          }}
                          placeholder="KPI"
                          aria-label="Edit KPI description"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={editData.annual_target || ''}
                          onChange={(e) => setEditData({ ...editData, annual_target: parseFloat(e.target.value) || 0 })}
                          className="text-right"
                          placeholder="Annual Target"
                          aria-label="Edit annual target"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" onClick={saveEdit} aria-label="Save changes">
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={cancelEdit} aria-label="Cancel editing">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-semibold">
                        <Badge variant="outline" className="border-primary/30 bg-primary/5">
                          {obj.pillar}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{objText || obj.objective}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs font-bold">
                          {targetNum}
                        </Badge>
                      </TableCell>
                      <TableCell>{targetText || obj.target}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs font-semibold border-accent/50">
                          {kpiNum}
                        </Badge>
                      </TableCell>
                      <TableCell>{kpiText || obj.kpi}</TableCell>
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
                    </>
                  )}
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
    </>
  );
}

