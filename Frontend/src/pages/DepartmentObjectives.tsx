import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
import {
  getDepartmentObjectives,
  createDepartmentObjective,
  updateDepartmentObjective,
  deleteDepartmentObjective,
  getMainObjectives,
  getDepartments,
  getRASCIByDepartment,
} from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import KPISelector from '@/components/wig/KPISelector';
import MonthlyDataEditor from '@/components/wig/MonthlyDataEditor';
import MEKPIsModal from '@/components/wig/MEKPIsModal';
import type { DepartmentObjective, MainPlanObjective, Department, RASCIWithExistence } from '@/types/wig';
import { LogOut, Plus, Edit2, Trash2, Calendar, Loader2, RefreshCw, Filter, X, Check, Search, Folder, ZoomIn, ZoomOut } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NavigationBar from '@/components/shared/NavigationBar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface MEEKPI {
  id?: number;
  me_kpi: string;
  mov: string;
  target?: number | null;
  actual?: number | null;
  frequency?: string;
  start_date?: string;
  end_date?: string;
  tool?: string;
  responsible?: string;
  folder_link?: string;
}

const KPI_DELIMITER = '||'; // Delimiter for storing multiple KPIs

// Helper function to parse KPIs from string (handles both single and multiple)
const parseKPIs = (kpiString: string | undefined | null): string[] => {
  if (!kpiString) return [];
  if (kpiString.includes(KPI_DELIMITER)) {
    return kpiString.split(KPI_DELIMITER).filter(k => k.trim());
  }
  return [kpiString];
};

// Helper function to join KPIs into a string
const joinKPIs = (kpis: string | string[] | undefined): string => {
  if (!kpis) return '';
  if (Array.isArray(kpis)) {
    return kpis.filter(k => k.trim()).join(KPI_DELIMITER);
  }
  return kpis;
};

// SortableRow component for drag-and-drop
interface SortableRowProps {
  id: number;
  children: (props: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode;
  isEditing?: boolean;
}

function SortableRow({ id, children, isEditing }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id.toString(), disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </TableRow>
  );
}

export default function DepartmentObjectives() {
  const [user, setUser] = useState<any>(null);
  const [objectives, setObjectives] = useState<DepartmentObjective[]>([]);
  const [mainObjectives, setMainObjectives] = useState<MainPlanObjective[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rasciMetrics, setRasciMetrics] = useState<RASCIWithExistence[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('objectives');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addingMEForObjective, setAddingMEForObjective] = useState<number | null>(null);
  const [meKPIs, setMeKPIs] = useState<MEEKPI[]>([]);
  const [selectedMEObjective, setSelectedMEObjective] = useState<DepartmentObjective | null>(null);
  const [isMEModalOpen, setIsMEModalOpen] = useState(false);
  const [newMEKPI, setNewMEKPI] = useState<MEEKPI>({ 
    me_kpi: '', 
    mov: '',
    target: null,
    actual: null,
    frequency: '',
    start_date: '',
    end_date: '',
    tool: '',
    responsible: '',
    folder_link: ''
  });
  const [editData, setEditData] = useState<Partial<DepartmentObjective>>({});
  const [newData, setNewData] = useState<Partial<DepartmentObjective & { kpi: string | string[] }>>({
    kpi: [],
    activity: '',
    type: 'Direct',
    activity_target: 0,
    responsible_person: '',
    mov: '',
    main_objective_id: null,
  });
  
  // Filter states for Excel-like filtering (arrays of selected values)
  const [filters, setFilters] = useState<{
    kpi: string[];
    activity: string[];
    type: string[];
    target: string[];
    responsible: string[];
    mov: string[];
    mainObjective: string[];
  }>({
    kpi: [],
    activity: [],
    type: [],
    target: [],
    responsible: [],
    mov: [],
    mainObjective: [],
  });

  // Track which filter popover is currently open
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // Column width resizing state
  const [columnWidths, setColumnWidths] = useState({
    index: 60,
    kpi: 250,
    activity: 300,
    type: 120,
    target: 120,
    responsible: 180,
    mov: 250,
    actions: 150
  });

  // Column resizing state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Table zoom state
  const [tableZoom, setTableZoom] = useState(0.85); // Default 85% zoom

  const handleZoomIn = () => {
    setTableZoom(prev => Math.min(prev + 0.1, 1.5)); // Max 150%
  };

  const handleZoomOut = () => {
    setTableZoom(prev => Math.max(prev - 0.1, 0.5)); // Min 50%
  };

  const handleZoomReset = () => {
    setTableZoom(0.85); // Reset to default
  };

  // Filter states for RASCI Metrics table
  const [rasciFilters, setRasciFilters] = useState<{
    kpi: string[];
    role: string[];
    exists: string[];
  }>({
    kpi: [],
    role: [],
    exists: [],
  });
  
  const navigate = useNavigate();

  // State for department filter (CEO/admin only)
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    if (userObj.role !== 'department' && userObj.role !== 'CEO') {
      navigate('/access-denied');
      return;
    }

    setUser(userObj);
    loadData();
  }, [navigate]);

  // Reload data when selected department changes (for CEO/admin)
  useEffect(() => {
    if (user?.role === 'CEO') {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const userData = localStorage.getItem('user');
      if (!userData) return;
      
      const userObj = JSON.parse(userData);
      // For CEO/admin, use selectedDepartment if set, otherwise use first department or null for all
      // For regular department users, use their own department
      let departmentCode: string | undefined;
      if (userObj.role === 'CEO') {
        departmentCode = selectedDepartment || undefined; // undefined means all departments
      } else {
        departmentCode = userObj.departments?.[0];
      }
      
      const [deptObjectives, mainObjs, depts, rasciData] = await Promise.all([
        getDepartmentObjectives({ department_code: departmentCode }),
        getMainObjectives(),
        getDepartments(),
        departmentCode ? getRASCIByDepartment(departmentCode) : Promise.resolve([]),
      ]);
      
      setObjectives(deptObjectives);
      setMainObjectives(mainObjs);
      setDepartments(depts);
      setRasciMetrics(rasciData);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load department objectives',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const startEdit = (obj: DepartmentObjective) => {
    setEditingId(obj.id);
    setEditData({ ...obj });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  // Column resizing handlers
  const handleResizeStart = (column: keyof typeof columnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column]);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn) return;
    const diff = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff);
    setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  // Drag and drop handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setObjectives(prev => {
        const oldIndex = prev.findIndex(obj => obj.id === Number(active.id));
        const newIndex = prev.findIndex(obj => obj.id === Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;
        const newArray = [...prev];
        [newArray[oldIndex], newArray[newIndex]] = [newArray[newIndex], newArray[oldIndex]];
        return newArray;
      });
    }
  };

  // Add mouse move and up listeners for resizing
  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const saveEdit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingId) return;

    try {
      // Convert KPI array to delimited string if needed
      const updateData: any = { ...editData };
      if (updateData.kpi && Array.isArray(updateData.kpi)) {
        updateData.kpi = joinKPIs(updateData.kpi);
      }
      await updateDepartmentObjective(editingId, updateData);
      toast({
        title: 'Success',
        description: 'Objective updated successfully',
      });
      setEditingId(null);
      setEditData({});
      // Refresh data without showing loading spinner
      loadData(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update objective',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      await deleteDepartmentObjective(deletingId);
      toast({
        title: 'Success',
        description: 'Objective deleted successfully',
      });
      setDeletingId(null);
      // Refresh data without showing loading spinner
      loadData(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete objective',
        variant: 'destructive',
      });
    }
  };

  const handleAdd = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const kpiArray = Array.isArray(newData.kpi) ? newData.kpi : (newData.kpi ? [newData.kpi] : []);
    if (kpiArray.length === 0 || !newData.activity || !newData.activity_target || !newData.responsible_person || !newData.mov) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const userData = localStorage.getItem('user');
      if (!userData) return;
      
      const userObj = JSON.parse(userData);
      const department = departments.find((d) => d.code === userObj.departments?.[0]);
      
      if (!department) {
        toast({
          title: 'Error',
          description: 'Department not found',
          variant: 'destructive',
        });
        return;
      }

      await createDepartmentObjective({
        department_id: department.id,
        kpi: joinKPIs(kpiArray),
        activity: newData.activity!,
        type: newData.type === 'blank' ? '' : newData.type!,
        activity_target: parseFloat(newData.activity_target!.toString()),
        responsible_person: newData.responsible_person!,
        mov: newData.mov!,
        main_objective_id: newData.main_objective_id || null,
      });
      
      toast({
        title: 'Success',
        description: 'Objective created successfully',
      });
      
      setIsAdding(false);
      setNewData({
        kpi: [],
        activity: '',
        type: 'Direct',
        activity_target: 0,
        responsible_person: '',
        mov: '',
        main_objective_id: null,
      });
      // Refresh data without showing loading spinner
      loadData(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create objective',
        variant: 'destructive',
      });
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('user');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const userDepartment = departments.find((d) => d.code === user?.departments?.[0]);
  
  // Permission check: Only CEO/admin can modify M&E KPIs
  const canModifyMEKPIs = user?.role === 'CEO';

  // Get unique values for each column (handle multiple KPIs)
  const uniqueKPIs = Array.from(new Set(
    objectives.flatMap(o => parseKPIs(o.kpi))
  )).sort();
  const uniqueActivities = Array.from(new Set(objectives.map(o => o.activity).filter(Boolean))).sort();
  const uniqueTypes = Array.from(new Set(objectives.map(o => o.type).filter(Boolean))).sort();
  const uniqueTargets = Array.from(new Set(objectives.map(o => o.activity_target.toString()).filter(Boolean))).sort((a, b) => parseFloat(a) - parseFloat(b));
  const uniqueResponsible = Array.from(new Set(objectives.map(o => o.responsible_person).filter(Boolean))).sort();
  const uniqueMOVs = Array.from(new Set(objectives.map(o => o.mov).filter(Boolean))).sort();
  
  // Get unique main objectives (with labels)
  const mainObjectiveMap = new Map<string, string>();
  objectives.forEach(obj => {
    if (obj.main_objective_id) {
      const mainObj = mainObjectives.find(o => o.id === obj.main_objective_id);
      if (mainObj) {
        const label = `${mainObj.objective} - ${mainObj.kpi}`;
        mainObjectiveMap.set(label, label);
      }
    } else {
      mainObjectiveMap.set('Not linked', 'Not linked');
    }
  });
  const uniqueMainObjectives = Array.from(mainObjectiveMap.values()).sort();

  // Filter objectives based on selected filter values
  const filteredObjectives = objectives.filter((obj) => {
    const objKPIs = parseKPIs(obj.kpi);
    const matchesKPI = filters.kpi.length === 0 || objKPIs.some(kpi => filters.kpi.includes(kpi));
    const matchesActivity = filters.activity.length === 0 || filters.activity.includes(obj.activity);
    const matchesType = filters.type.length === 0 || filters.type.includes(obj.type || '');
    const matchesTarget = filters.target.length === 0 || filters.target.includes(obj.activity_target.toString());
    const matchesResponsible = filters.responsible.length === 0 || filters.responsible.includes(obj.responsible_person);
    const matchesMOV = filters.mov.length === 0 || filters.mov.includes(obj.mov);
    
    // Match main objective
    let mainObjLabel = 'Not linked';
    if (obj.main_objective_id) {
      const mainObj = mainObjectives.find((o) => o.id === obj.main_objective_id);
      if (mainObj) {
        mainObjLabel = `${mainObj.objective} - ${mainObj.kpi}`;
      }
    }
    const matchesMainObjective = filters.mainObjective.length === 0 || filters.mainObjective.includes(mainObjLabel);
    
    return matchesKPI && matchesActivity && matchesType && matchesTarget &&
           matchesResponsible && matchesMOV && matchesMainObjective;
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

  // Get unique values for RASCI Metrics filters
  const rasciWithRoles = rasciMetrics.filter(rasci => rasci.role && rasci.role !== '—' && rasci.role.trim() !== '');
  const uniqueRasciKPIs = Array.from(new Set(rasciWithRoles.map(r => r.kpi).filter(Boolean))).sort();
  const uniqueRasciRoles = Array.from(new Set(rasciWithRoles.map(r => r.role).filter(Boolean))).sort();
  const uniqueRasciExists = ['Exists', 'Not exists'];

  // Filter RASCI metrics based on selected filter values
  const filteredRasciMetrics = rasciWithRoles.filter((rasci) => {
    const matchesKPI = rasciFilters.kpi.length === 0 || rasciFilters.kpi.includes(rasci.kpi);
    const matchesRole = rasciFilters.role.length === 0 || rasciFilters.role.includes(rasci.role);
    const existsLabel = rasci.exists_in_activities ? 'Exists' : 'Not exists';
    const matchesExists = rasciFilters.exists.length === 0 || rasciFilters.exists.includes(existsLabel);
    
    return matchesKPI && matchesRole && matchesExists;
  });

  const toggleRasciFilterValue = (filterKey: keyof typeof rasciFilters, value: string) => {
    const currentValues = rasciFilters[filterKey];
    if (currentValues.includes(value)) {
      setRasciFilters({ ...rasciFilters, [filterKey]: currentValues.filter(v => v !== value) });
    } else {
      setRasciFilters({ ...rasciFilters, [filterKey]: [...currentValues, value] });
    }
  };

  const clearRasciFilter = (filterKey: keyof typeof rasciFilters) => {
    setRasciFilters({ ...rasciFilters, [filterKey]: [] });
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
                    setOpen(false);
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

  const handleOpenMEModal = (objective: DepartmentObjective) => {
    setSelectedMEObjective(objective);
    setIsMEModalOpen(true);
  };

  const handleCloseMEModal = () => {
    setIsMEModalOpen(false);
    setSelectedMEObjective(null);
  };

  const handleDeleteMEKPI = async (id: number) => {
    if (!canModifyMEKPIs) {
      toast({
        title: 'Access Denied',
        description: 'Only CEO and admin users can delete M&E KPIs',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await deleteDepartmentObjective(id);
      toast({
        title: 'Success',
        description: 'M&E KPI deleted successfully',
      });
      // Reload data to refresh the objectives list
      await loadData(false);
      // If modal is still open, update the selected objective's M&E KPIs
      if (selectedMEObjective && isMEModalOpen) {
        // The modal will automatically show updated data since objectives state is updated
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.response?.data?.error || 'Failed to delete M&E KPI',
        variant: 'destructive',
      });
    }
  };

  const handleAddMEKPI = async (parentObjectiveId: number) => {
    if (!canModifyMEKPIs) {
      toast({
        title: 'Access Denied',
        description: 'Only CEO and admin users can add M&E KPIs',
        variant: 'destructive',
      });
      return;
    }
    
    if (!newMEKPI.me_kpi || !newMEKPI.mov) {
      toast({
        title: 'Error',
        description: 'Please fill both M&E KPI and MOV fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const userData = localStorage.getItem('user');
      if (!userData) return;
      
      // Get the parent objective to link the M&E KPI
      const parentObjective = objectives.find((o) => o.id === parentObjectiveId);
      
      if (!parentObjective) {
        toast({
          title: 'Error',
          description: 'Parent objective not found',
          variant: 'destructive',
        });
        return;
      }

      // M&E KPIs should belong to the same department as their parent objective
      // Use parent objective's department_code, or fall back to selectedDepartment for CEO/admin
      const userObj = JSON.parse(userData);
      let departmentCode: string | undefined = parentObjective.department_code;
      
      // If parent objective doesn't have department_code (shouldn't happen, but just in case)
      // For CEO/admin, use selectedDepartment; for regular users, use their own department
      if (!departmentCode) {
        if (userObj.role === 'CEO') {
          departmentCode = selectedDepartment || undefined;
        } else {
          departmentCode = userObj.departments?.[0];
        }
      }
      
      const department = departments.find((d) => d.code === departmentCode);
      
      if (!department) {
        toast({
          title: 'Error',
          description: 'Department not found. Please select a department filter if you are CEO/admin.',
          variant: 'destructive',
        });
        return;
      }
      
      // Store M&E KPI as a department objective with parent reference in activity
      const meDataToSave = {
        department_id: department.id,
        kpi: newMEKPI.me_kpi,
        activity: `[M&E-PARENT:${parentObjectiveId}] ${newMEKPI.me_kpi}`, // Mark as M&E with parent reference
        type: 'M&E' as any, // Use M&E type
        activity_target: 0,
        responsible_person: newMEKPI.responsible || '',
        mov: newMEKPI.mov,
        main_objective_id: parentObjective?.main_objective_id || null, // Link to same main objective as parent
        me_target: newMEKPI.target || null,
        me_actual: newMEKPI.actual || null,
        me_frequency: newMEKPI.frequency || null,
        me_start_date: newMEKPI.start_date || null,
        me_end_date: newMEKPI.end_date || null,
        me_tool: newMEKPI.tool || null,
        me_responsible: newMEKPI.responsible || null,
        me_folder_link: newMEKPI.folder_link || null,
      };
      
      console.log('[handleAddMEKPI] Saving M&E KPI with data:', meDataToSave);
      const savedObjective = await createDepartmentObjective(meDataToSave);
      console.log('[handleAddMEKPI] Saved objective returned:', savedObjective);
      
      toast({
        title: 'Success',
        description: 'M&E KPI created successfully',
      });
      
      setAddingMEForObjective(null);
      setNewMEKPI({ 
        me_kpi: '', 
        mov: '',
        target: null,
        actual: null,
        frequency: '',
        start_date: '',
        end_date: '',
        tool: '',
        responsible: '',
        folder_link: ''
      });
      loadData(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create M&E KPI',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col gap-2">
            {/* Top Row: Logo, Title, Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center p-1">
                  <img 
                    src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-foreground">
                    Department Objectives
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {userDepartment?.name || 'Department'} Dashboard
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => loadData()} className="h-7 px-2 text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleSignOut} className="h-7 px-2 text-xs">
                  <LogOut className="w-3 h-3 mr-1" />
                  Sign Out
                </Button>
              </div>
            </div>

            {/* Navigation Row */}
            <NavigationBar user={user} />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Department Filter for CEO/Admin */}
        {user?.role === 'CEO' && departments.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Label htmlFor="department-filter" className="text-sm font-medium">
                  Filter by Department:
                </Label>
                <Select
                  value={selectedDepartment || 'all'}
                  onValueChange={(value) => {
                    setSelectedDepartment(value === 'all' ? null : value);
                  }}
                >
                  <SelectTrigger id="department-filter" className="w-[250px]">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.code}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="objectives">Objectives</TabsTrigger>
            <TabsTrigger value="rasci">RASCI Metrics</TabsTrigger>
          </TabsList>

          {/* Objectives Tab */}
          <TabsContent value="objectives" className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Department Objectives</CardTitle>
              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center gap-2 border rounded-md px-2 py-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleZoomOut}
                    disabled={tableZoom <= 0.5}
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[60px] text-center">
                    {Math.round(tableZoom * 100)}%
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleZoomIn}
                    disabled={tableZoom >= 1.5}
                    title="Zoom In"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleZoomReset}
                    title="Reset Zoom"
                    className="text-xs"
                  >
                    Reset
                  </Button>
                </div>
                <Button onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsAdding(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Objective
              </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              className="border rounded-md overflow-x-auto"
              style={{ 
                zoom: tableZoom,
                WebkitTransform: `scale(${tableZoom})`,
                transform: `scale(${tableZoom})`,
                transformOrigin: 'top left',
                width: tableZoom < 1 ? `${100 / tableZoom}%` : '100%',
                minHeight: tableZoom < 1 ? `${100 / tableZoom}%` : 'auto'
              }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: columnWidths.index, minWidth: columnWidths.index, position: 'relative' }}>
                      <div className="flex items-center justify-center">
                        <span>N</span>
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('index', e)}
                      />
                    </TableHead>
                    <TableHead style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi, position: 'relative' }}>
                      <div className="flex items-center gap-2">
                        <span>KPI</span>
                        <ExcelFilter
                          filterId="kpi"
                          column="KPI"
                          uniqueValues={uniqueKPIs}
                          selectedValues={filters.kpi}
                          onToggle={(value) => toggleFilterValue('kpi', value)}
                          onClear={() => clearFilter('kpi')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('kpi', e)}
                      />
                    </TableHead>
                    <TableHead style={{ width: columnWidths.activity, minWidth: columnWidths.activity, position: 'relative' }}>
                      <div className="flex items-center gap-2">
                        <span>Activity</span>
                        <ExcelFilter
                          filterId="activity"
                          column="Activity"
                          uniqueValues={uniqueActivities}
                          selectedValues={filters.activity}
                          onToggle={(value) => toggleFilterValue('activity', value)}
                          onClear={() => clearFilter('activity')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('activity', e)}
                      />
                    </TableHead>
                    <TableHead style={{ width: columnWidths.type, minWidth: columnWidths.type, position: 'relative' }}>
                      <div className="flex items-center gap-2">
                        <span>Type</span>
                        <ExcelFilter
                          filterId="type"
                          column="Type"
                          uniqueValues={uniqueTypes}
                          selectedValues={filters.type}
                          onToggle={(value) => toggleFilterValue('type', value)}
                          onClear={() => clearFilter('type')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('type', e)}
                      />
                    </TableHead>
                    <TableHead className="text-right" style={{ width: columnWidths.target, minWidth: columnWidths.target, position: 'relative' }}>
                      <div className="flex items-center gap-2 justify-end">
                        <span>Target</span>
                        <ExcelFilter
                          filterId="target"
                          column="Target"
                          uniqueValues={uniqueTargets}
                          selectedValues={filters.target}
                          onToggle={(value) => toggleFilterValue('target', value)}
                          onClear={() => clearFilter('target')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('target', e)}
                      />
                    </TableHead>
                    <TableHead style={{ width: columnWidths.responsible, minWidth: columnWidths.responsible, position: 'relative' }}>
                      <div className="flex items-center gap-2">
                        <span>Responsible</span>
                        <ExcelFilter
                          filterId="responsible"
                          column="Responsible"
                          uniqueValues={uniqueResponsible}
                          selectedValues={filters.responsible}
                          onToggle={(value) => toggleFilterValue('responsible', value)}
                          onClear={() => clearFilter('responsible')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('responsible', e)}
                      />
                    </TableHead>
                    <TableHead style={{ width: columnWidths.mov, minWidth: columnWidths.mov, position: 'relative' }}>
                      <div className="flex items-center gap-2">
                        <span>MOV</span>
                        <ExcelFilter
                          filterId="mov"
                          column="MOV"
                          uniqueValues={uniqueMOVs}
                          selectedValues={filters.mov}
                          onToggle={(value) => toggleFilterValue('mov', value)}
                          onClear={() => clearFilter('mov')}
                        />
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50"
                        onMouseDown={(e) => handleResizeStart('mov', e)}
                      />
                    </TableHead>
                    <TableHead className="text-right" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={filteredObjectives.filter(obj => obj.type !== 'M&E' && obj.type !== 'M&E MOV' && !obj.activity?.startsWith('[M&E]') && !obj.activity?.startsWith('[M&E-PARENT:')).map(obj => obj.id.toString())} strategy={verticalListSortingStrategy}>
                      {/* Add Regular Objective Row */}
                      {isAdding && (
                        <TableRow>
                          <TableCell style={{ width: columnWidths.index, minWidth: columnWidths.index }}></TableCell>
                          <TableCell style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }}>
                        <KPISelector
                          value={newData.kpi}
                          onValueChange={(value) => setNewData({ ...newData, kpi: value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={newData.activity || ''}
                          onChange={(e) => setNewData({ ...newData, activity: e.target.value })}
                          placeholder="Activity"
                          className="w-full"
                          autoFocus
                        />
                      </TableCell>
                      <TableCell style={{ width: columnWidths.type, minWidth: columnWidths.type }}>
                        <Select
                          value={newData.type || 'Direct'}
                          onValueChange={(value: 'Direct' | 'In direct') => setNewData({ ...newData, type: value })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Direct">Direct</SelectItem>
                            <SelectItem value="In direct">In direct</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell style={{ width: columnWidths.target, minWidth: columnWidths.target }}>
                        <Input
                          type="number"
                          value={newData.activity_target || ''}
                          onChange={(e) => setNewData({ ...newData, activity_target: parseFloat(e.target.value) || 0 })}
                          placeholder="Target"
                          className="text-right w-full"
                        />
                      </TableCell>
                      <TableCell style={{ width: columnWidths.responsible, minWidth: columnWidths.responsible }}>
                        <Input
                          value={newData.responsible_person || ''}
                          onChange={(e) => setNewData({ ...newData, responsible_person: e.target.value })}
                          placeholder="Responsible Person"
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell style={{ width: columnWidths.mov, minWidth: columnWidths.mov }}>
                        <Input
                          value={newData.mov || ''}
                          onChange={(e) => setNewData({ ...newData, mov: e.target.value })}
                          placeholder="MOV"
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell className="text-right" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" onClick={(e) => handleAdd(e)}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setIsAdding(false)}>
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                      {/* Display regular objectives with their M&E KPIs */}
                      {filteredObjectives
                        .filter(obj => obj.type !== 'M&E' && obj.type !== 'M&E MOV' && !obj.activity?.startsWith('[M&E]') && !obj.activity?.startsWith('[M&E-PARENT:'))
                        .map((obj, index) => {
                          // Get M&E KPIs for this objective
                          const meKPIsForObjective = filteredObjectives.filter(
                            meObj => (meObj.type === 'M&E' || meObj.type === 'M&E MOV') && meObj.activity?.startsWith(`[M&E-PARENT:${obj.id}]`)
                          );
                          
                          return (
                            <>
                              <SortableRow key={obj.id} id={obj.id} isEditing={editingId === obj.id}>
                                {({ attributes, listeners }) => (
                                  <>
                                    {editingId === obj.id ? (
                                    <>
                                      <TableCell style={{ width: columnWidths.index, minWidth: columnWidths.index }} className="text-center">
                                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing w-full h-full flex items-center justify-center">
                                          <span className="text-sm text-muted-foreground">{index + 1}</span>
                                        </div>
                                      </TableCell>
                                  <TableCell style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }}>
                                    <KPISelector
                                      value={editData.kpi ? (Array.isArray(editData.kpi) ? editData.kpi : parseKPIs(editData.kpi as string)) : parseKPIs(obj.kpi)}
                                      onValueChange={(value) => setEditData({ ...editData, kpi: value })}
                                      multiple={true}
                                    />
                                  </TableCell>
                                  <TableCell style={{ width: columnWidths.activity, minWidth: columnWidths.activity }}>
                                    <Input
                                      value={editData.activity || obj.activity}
                                      onChange={(e) => setEditData({ ...editData, activity: e.target.value })}
                                      className="w-full"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          saveEdit();
                                        } else if (e.key === 'Escape') {
                                          cancelEdit();
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell style={{ width: columnWidths.type, minWidth: columnWidths.type }}>
                                    <Select
                                      value={editData.type || obj.type}
                                      onValueChange={(value: 'Direct' | 'In direct') => setEditData({ ...editData, type: value })}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Direct">Direct</SelectItem>
                                        <SelectItem value="In direct">In direct</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell style={{ width: columnWidths.target, minWidth: columnWidths.target }}>
                                    <Input
                                      type="number"
                                      value={editData.activity_target?.toString() || obj.activity_target.toString()}
                                      onChange={(e) => setEditData({ ...editData, activity_target: parseFloat(e.target.value) || 0 })}
                                      className="text-right w-full"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          saveEdit();
                                        } else if (e.key === 'Escape') {
                                          cancelEdit();
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell style={{ width: columnWidths.responsible, minWidth: columnWidths.responsible }}>
                                    <Input
                                      value={editData.responsible_person || obj.responsible_person}
                                      onChange={(e) => setEditData({ ...editData, responsible_person: e.target.value })}
                                      className="w-full"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          saveEdit();
                                        } else if (e.key === 'Escape') {
                                          cancelEdit();
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell style={{ width: columnWidths.mov, minWidth: columnWidths.mov }}>
                                    <Input
                                      value={editData.mov || obj.mov}
                                      onChange={(e) => setEditData({ ...editData, mov: e.target.value })}
                                      className="w-full"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          saveEdit();
                                        } else if (e.key === 'Escape') {
                                          cancelEdit();
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="text-right" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" size="sm" onClick={saveEdit}>
                                        Save
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                                    ) : (
                                      <>
                                        <TableCell style={{ width: columnWidths.index, minWidth: columnWidths.index }} className="text-center">
                                          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing w-full h-full flex items-center justify-center">
                                            <span className="text-sm text-muted-foreground">{index + 1}</span>
                                          </div>
                                        </TableCell>
                                  <TableCell className="font-medium" style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }}>
                            <div className="flex flex-wrap gap-1">
                              {parseKPIs(obj.kpi).map((kpi, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {kpi}
                                </Badge>
                              ))}
                                  </div>
                                </TableCell>
                                <TableCell style={{ width: columnWidths.activity, minWidth: columnWidths.activity }}>{obj.activity}</TableCell>
                                <TableCell style={{ width: columnWidths.type, minWidth: columnWidths.type }}>
                                  <Badge variant={obj.type === 'Direct' ? 'default' : 'secondary'}>
                                    {obj.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right" style={{ width: columnWidths.target, minWidth: columnWidths.target }}>{obj.activity_target.toLocaleString()}</TableCell>
                                <TableCell style={{ width: columnWidths.responsible, minWidth: columnWidths.responsible }}>{obj.responsible_person}</TableCell>
                                <TableCell style={{ width: columnWidths.mov, minWidth: columnWidths.mov }}>{obj.mov}</TableCell>
                                <TableCell className="text-right" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                            <div className="flex justify-end gap-2">
                              {meKPIsForObjective.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenMEModal(obj)}
                                  aria-label={`View ${meKPIsForObjective.length} M&E KPIs`}
                                  title={`View ${meKPIsForObjective.length} M&E KPIs`}
                                >
                                  <Badge variant="secondary" className="mr-1">
                                    {meKPIsForObjective.length}
                                  </Badge>
                                  M&E
                                </Button>
                              )}
                              {canModifyMEKPIs && (
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => {
                                    setAddingMEForObjective(obj.id);
                                    setNewMEKPI({ 
                                      me_kpi: '', 
                                      mov: '',
                                      target: null,
                                      actual: null,
                                      frequency: '',
                                      start_date: '',
                                    end_date: '',
                                    tool: '',
                                    responsible: '',
                                    folder_link: ''
                                  });
                                }}
                                aria-label={`Add M&E KPI for objective ${obj.id}`}
                                title="Add M&E KPI"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                M&E
                              </Button>
                              )}
                              <MonthlyDataEditor 
                                kpi={obj.kpi} 
                                departmentId={obj.department_id}
                                trigger={
                                  <Button type="button" size="sm" variant="outline" aria-label="Edit monthly data" title="Edit monthly data">
                                    <Calendar className="h-4 w-4" />
                                  </Button>
                                }
                              />
                              <Button type="button" size="sm" variant="outline" onClick={() => startEdit(obj)} aria-label={`Edit objective ${obj.id}`} title="Edit objective">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setDeletingId(obj.id)} aria-label={`Delete objective ${obj.id}`} title="Delete objective">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                                </div>
                              </TableCell>
                                      </>
                                    )}
                                  </>
                                )}
                              </SortableRow>
                              
                              {/* Add M&E KPI row for this objective */}
                              {addingMEForObjective === obj.id && canModifyMEKPIs && (
                      <>
                        <TableRow className="bg-muted/30">
                          <TableCell style={{ width: columnWidths.index, minWidth: columnWidths.index }}></TableCell>
                          <TableCell colSpan={2} style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }}>
                            <Input
                              value={newMEKPI.me_kpi}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, me_kpi: e.target.value })}
                              placeholder="M&E KPI"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">M&E</Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={newMEKPI.target || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, target: parseFloat(e.target.value) || null })}
                              placeholder="Target"
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={newMEKPI.actual || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, actual: parseFloat(e.target.value) || null })}
                              placeholder="Actual"
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={newMEKPI.mov}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, mov: e.target.value })}
                              placeholder="MOV"
                            />
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" onClick={() => handleAddMEKPI(obj.id)}>
                                Save
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => {
                                setAddingMEForObjective(null);
                                setNewMEKPI({ 
                                  me_kpi: '', 
                                  mov: '',
                                  target: null,
                                  actual: null,
                                  frequency: '',
                                  start_date: '',
                                  end_date: '',
                                  tool: '',
                                  responsible: '',
                                  folder_link: ''
                                });
                              }}>
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={2}>
                            <Select
                              value={newMEKPI.frequency || ''}
                              onValueChange={(value) => setNewMEKPI({ ...newMEKPI, frequency: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Frequency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Daily">Daily</SelectItem>
                                <SelectItem value="Weekly">Weekly</SelectItem>
                                <SelectItem value="Monthly">Monthly</SelectItem>
                                <SelectItem value="Quarterly">Quarterly</SelectItem>
                                <SelectItem value="Annually">Annually</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={newMEKPI.start_date || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, start_date: e.target.value })}
                              placeholder="Start Date"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={newMEKPI.end_date || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, end_date: e.target.value })}
                              placeholder="End Date"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={newMEKPI.tool || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, tool: e.target.value })}
                              placeholder="Tool"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={newMEKPI.responsible || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, responsible: e.target.value })}
                              placeholder="Responsible"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={newMEKPI.folder_link || ''}
                              onChange={(e) => setNewMEKPI({ ...newMEKPI, folder_link: e.target.value })}
                              placeholder="Folder Link"
                            />
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                        </> 
                      );
                    })}
                    </SortableContext>
                  </DndContext>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          {/* RASCI Metrics Tab */}
          <TabsContent value="rasci" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>RASCI Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <span>KPI</span>
                        <ExcelFilter
                          filterId="rasci-kpi"
                          column="KPI"
                          uniqueValues={uniqueRasciKPIs}
                          selectedValues={rasciFilters.kpi}
                          onToggle={(value) => toggleRasciFilterValue('kpi', value)}
                          onClear={() => clearRasciFilter('kpi')}
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <span>Role</span>
                        <ExcelFilter
                          filterId="rasci-role"
                          column="Role"
                          uniqueValues={uniqueRasciRoles}
                          selectedValues={rasciFilters.role}
                          onToggle={(value) => toggleRasciFilterValue('role', value)}
                          onClear={() => clearRasciFilter('role')}
                        />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <span>Exists in your activities</span>
                        <ExcelFilter
                          filterId="rasci-exists"
                          column="Exists in your activities"
                          uniqueValues={uniqueRasciExists}
                          selectedValues={rasciFilters.exists}
                          onToggle={(value) => toggleRasciFilterValue('exists', value)}
                          onClear={() => clearRasciFilter('exists')}
                        />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRasciMetrics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No RASCI metrics with assigned roles found for this department.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRasciMetrics.map((rasci) => (
                      <TableRow key={rasci.id}>
                        <TableCell className="font-medium">{rasci.kpi}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{rasci.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {rasci.exists_in_activities ? (
                            <Badge variant="default" className="bg-green-600">Exists</Badge>
                          ) : (
                            <Badge variant="destructive">Not exists</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>

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

        {/* M&E KPIs Modal */}
        {selectedMEObjective && (
          <MEKPIsModal
            isOpen={isMEModalOpen}
            onClose={handleCloseMEModal}
            objectiveKPI={selectedMEObjective.kpi}
            objectiveActivity={selectedMEObjective.activity}
            meKPIs={(() => {
              const filtered = objectives.filter(
                (o) =>
                  (o.type === 'M&E' || o.type === 'M&E MOV') &&
                  o.activity.includes(`[M&E-PARENT:${selectedMEObjective.id}]`)
              );
              console.log('[DepartmentObjectives] Filtering M&E KPIs for objective:', selectedMEObjective.id);
              console.log('[DepartmentObjectives] All objectives count:', objectives.length);
              console.log('[DepartmentObjectives] M&E objectives found:', filtered.length);
              console.log('[DepartmentObjectives] Filtered M&E KPIs:', filtered);
              filtered.forEach((me, idx) => {
                console.log(`[DepartmentObjectives] M&E KPI ${idx + 1}:`, {
                  id: me.id,
                  kpi: me.kpi,
                  me_target: me.me_target,
                  me_actual: me.me_actual,
                  me_frequency: me.me_frequency,
                  me_tool: me.me_tool,
                  me_responsible: me.me_responsible,
                  me_folder_link: me.me_folder_link,
                  me_start_date: me.me_start_date,
                  me_end_date: me.me_end_date,
                  allKeys: Object.keys(me),
                });
              });
              return filtered;
            })()}
            onDelete={handleDeleteMEKPI}
            canModify={canModifyMEKPIs}
          />
        )}
      </div>
    </div>
  );
}

