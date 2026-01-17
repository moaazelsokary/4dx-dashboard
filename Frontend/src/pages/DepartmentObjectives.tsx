import { useEffect, useState, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  updateDepartmentObjectivesOrder,
  getMainObjectives,
  getDepartments,
  getRASCIByDepartment,
  getHierarchicalPlan,
} from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import KPISelector from '@/components/wig/KPISelector';
import MonthlyDataEditor from '@/components/wig/MonthlyDataEditor';
import MEKPIsModal from '@/components/wig/MEKPIsModal';
import ObjectiveFormModal from '@/components/wig/ObjectiveFormModal';
import type { DepartmentObjective, MainPlanObjective, Department, RASCIWithExistence, HierarchicalPlan } from '@/types/wig';
import { LogOut, Plus, Edit2, Trash2, Calendar, Loader2, RefreshCw, Filter, X, Check, Search, Folder, ZoomIn, ZoomOut, Layers, Sparkles, Target, TrendingUp, BarChart3 } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NavigationBar from '@/components/shared/NavigationBar';
import ExportButton from '@/components/shared/ExportButton';
import BidirectionalText from '@/components/ui/BidirectionalText';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import OptimizedImage from '@/components/ui/OptimizedImage';

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
const TYPE_DELIMITER = '||'; // Delimiter for storing multiple types (matching KPI order)

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

  // Simple handler that prevents drag on buttons
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Check if clicking on a button or inside a button
    if (target.closest('button') || target.closest('[data-no-drag]')) {
      return; // Don't start drag
    }
    // Call original handler if it exists
    if (listeners?.onPointerDown) {
      listeners.onPointerDown(e);
    }
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...(listeners ? { ...listeners, onPointerDown: handlePointerDown } : {})}
      className="cursor-grab active:cursor-grabbing hover:bg-primary/5 transition-colors"
    >
      {children({ attributes: {}, listeners: {}, isDragging })}
    </TableRow>
  );
}

export default function DepartmentObjectives() {
  const [user, setUser] = useState<any>(null);
  const [objectives, setObjectives] = useState<DepartmentObjective[]>([]);
  const [mainObjectives, setMainObjectives] = useState<MainPlanObjective[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rasciMetrics, setRasciMetrics] = useState<RASCIWithExistence[]>([]);
  const [hierarchicalData, setHierarchicalData] = useState<HierarchicalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('objectives');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [modalInitialData, setModalInitialData] = useState<Partial<DepartmentObjective> | undefined>(undefined);
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
    mov: 200,
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
      
      const [deptObjectives, mainObjs, depts, rasciData, hierarchical] = await Promise.all([
        getDepartmentObjectives({ department_code: departmentCode }),
        getMainObjectives(),
        getDepartments(),
        departmentCode ? getRASCIByDepartment(departmentCode) : Promise.resolve([]),
        getHierarchicalPlan(),
      ]);
      
      // Sort by sort_order if available, otherwise by id
      const sortedObjectives = [...deptObjectives].sort((a, b) => {
        if (a.sort_order !== undefined && b.sort_order !== undefined) {
          return a.sort_order - b.sort_order;
        }
        if (a.sort_order !== undefined) return -1;
        if (b.sort_order !== undefined) return 1;
        return a.id - b.id;
      });
      
      setObjectives(sortedObjectives);
      setMainObjectives(mainObjs);
      setDepartments(depts);
      setRasciMetrics(rasciData);
      setHierarchicalData(hierarchical);
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
    setModalInitialData(obj);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setModalInitialData(undefined);
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleModalSave = async (data: Partial<DepartmentObjective>) => {
    try {
      const userData = localStorage.getItem('user');
      if (!userData) {
        toast({
          title: 'Error',
          description: 'User not found. Please sign in again.',
          variant: 'destructive',
        });
        return;
      }
      
      const userObj = JSON.parse(userData);
      
      // Determine which department to use
      let departmentCode: string | undefined;
      if (userObj.role === 'CEO') {
        // CEO users should use selectedDepartment if set
        departmentCode = selectedDepartment || userObj.departments?.[0];
      } else {
        // Department users use their own department
        departmentCode = userObj.departments?.[0];
      }
      
      if (!departmentCode) {
        toast({
          title: 'Error',
          description: userObj.role === 'CEO' 
            ? 'Please select a department filter' 
            : 'Department not found in user profile',
          variant: 'destructive',
        });
        return;
      }
      
      // Find department by code (case-insensitive)
      const department = departments.find((d) => 
        d.code?.toLowerCase() === departmentCode?.toLowerCase()
      );
      
      if (!department) {
        console.error('[DepartmentObjectives] Department lookup failed:', {
          departmentCode,
          availableDepartments: departments.map(d => ({ code: d.code, name: d.name })),
          userDepartments: userObj.departments,
          userRole: userObj.role,
          selectedDepartment
        });
        toast({
          title: 'Error',
          description: `Department "${departmentCode}" not found. Available departments: ${departments.map(d => d.code).join(', ')}`,
          variant: 'destructive',
        });
        return;
      }

      let savedObjective: DepartmentObjective;

      if (modalMode === 'add') {
        // Optimistically add to UI immediately - use functional update for instant UI response
        const tempId = Date.now(); // Temporary ID
        const optimisticObjective: DepartmentObjective = {
          id: tempId,
          department_id: department.id,
          kpi: data.kpi!,
          activity: data.activity!,
          type: data.type!,
          activity_target: data.activity_target!,
          target_type: data.target_type || 'number',
          responsible_person: data.responsible_person!,
          mov: data.mov!,
          main_objective_id: data.main_objective_id || null,
          department_name: department.name,
          department_code: department.code,
          sort_order: objectives.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        // Add optimistically to UI immediately - use flushSync for instant re-render
        flushSync(() => {
          setObjectives(prev => {
            const updated = [...prev, optimisticObjective];
            // Sort to maintain order
            return updated.sort((a, b) => {
              if (a.sort_order !== undefined && b.sort_order !== undefined) {
                return a.sort_order - b.sort_order;
              }
              if (a.sort_order !== undefined) return -1;
              if (b.sort_order !== undefined) return 1;
              return a.id - b.id;
            });
          });
          setIsModalOpen(false);
          setModalInitialData(undefined);
        });
        
        toast({
          title: 'Creating...',
          description: 'Objective is being created',
        });
        
        // Save to database
        savedObjective = await createDepartmentObjective({
          department_id: department.id,
          kpi: data.kpi!,
          activity: data.activity!,
          type: data.type!,
          activity_target: data.activity_target!,
          target_type: data.target_type || 'number',
          responsible_person: data.responsible_person!,
          mov: data.mov!,
          main_objective_id: data.main_objective_id || null,
        });
        
        // Replace optimistic with real data - ensure all fields are present
        setObjectives(prev => {
          const updated = prev.map(obj => {
            if (obj.id === tempId) {
              // Ensure savedObjective has all required fields
              return {
                ...savedObjective,
                department_name: savedObjective.department_name || department.name,
                department_code: savedObjective.department_code || department.code,
              };
            }
            return obj;
          });
          // Re-sort after update
          return updated.sort((a, b) => {
            if (a.sort_order !== undefined && b.sort_order !== undefined) {
              return a.sort_order - b.sort_order;
            }
            if (a.sort_order !== undefined) return -1;
            if (b.sort_order !== undefined) return 1;
            return a.id - b.id;
          });
        });
        
        toast({
          title: 'Success',
          description: 'Objective created successfully',
        });
        
        // Force a re-render - filteredObjectives will update automatically via useMemo
      } else {
        if (!data.id) return;
        
        // Optimistically update in UI immediately - use flushSync for instant re-render
        flushSync(() => {
          setObjectives(prev => {
            const updated = prev.map(obj => 
              obj.id === data.id ? { ...obj, ...data, updated_at: new Date().toISOString() } : obj
            );
            return updated;
          });
          setIsModalOpen(false);
          setModalInitialData(undefined);
        });
        
        toast({
          title: 'Updating...',
          description: 'Objective is being updated',
        });
        
        // Save to database
        savedObjective = await updateDepartmentObjective(data.id, data);
        
      // Update with real data from server - ensure all fields are present
      setObjectives(prev => prev.map(obj => {
        if (obj.id === data.id) {
          return {
            ...savedObjective,
            department_name: savedObjective.department_name || obj.department_name,
            department_code: savedObjective.department_code || obj.department_code,
          };
        }
        return obj;
      }));
      
      toast({
        title: 'Success',
        description: 'Objective updated successfully',
      });
      
      // Force a re-render - filteredObjectives will update automatically via useMemo
      }
      
      // Reload in background to ensure sync (non-blocking)
      loadData(false).catch(err => {
        console.warn('[DepartmentObjectives] Background reload failed:', err);
      });
    } catch (err) {
      // On error, reload to get correct state
      loadData(false);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : `Failed to ${modalMode === 'add' ? 'create' : 'update'} objective`,
        variant: 'destructive',
      });
      throw err; // Re-throw to let modal handle it
    }
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
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldObjectives = [...objectives];
      const oldIndex = oldObjectives.findIndex(obj => obj.id === Number(active.id));
      const newIndex = oldObjectives.findIndex(obj => obj.id === Number(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      
      // Calculate new order
      const reorderedObjectives = [...oldObjectives];
      const [movedItem] = reorderedObjectives.splice(oldIndex, 1);
      
      // Insert above the target row
      if (oldIndex < newIndex) {
        // Moving down: insert at newIndex (which is now newIndex - 1 after splice)
        reorderedObjectives.splice(newIndex - 1, 0, movedItem);
      } else {
        // Moving up: insert at newIndex
        reorderedObjectives.splice(newIndex, 0, movedItem);
      }
      
      // Optimistically update UI
      setObjectives(reorderedObjectives);
      
      // Save order to database immediately
      try {
        // Update sort_order for all affected objectives (non-M&E only)
        const regularObjectives = reorderedObjectives.filter(
          obj => obj.type !== 'M&E' && obj.type !== 'M&E MOV' && !obj.activity?.startsWith('[M&E]') && !obj.activity?.startsWith('[M&E-PARENT:')
        );
        
        const updates = regularObjectives.map((obj, index) => ({
          id: obj.id,
          sort_order: index + 1,
        }));
        
        await updateDepartmentObjectivesOrder(updates);
      } catch (err) {
        // Revert on error
        setObjectives(oldObjectives);
        const errorMessage = err instanceof Error ? err.message : 'Failed to save row order';
        console.error('Error saving row order:', err);
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
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
      // Optimistically update in UI immediately - use flushSync for instant re-render
      flushSync(() => {
        setObjectives(prev => {
          const updated = prev.map(obj => 
            obj.id === editingId ? { ...obj, ...updateData, updated_at: new Date().toISOString() } : obj
          );
          return updated;
        });
        setEditingId(null);
        setEditData({});
      });
      
      toast({
        title: 'Updating...',
        description: 'Objective is being updated',
      });
      
      // Save to database
      const savedObjective = await updateDepartmentObjective(editingId, updateData);
      
      // Update with real data from server - ensure all fields are present
      setObjectives(prev => prev.map(obj => {
        if (obj.id === editingId) {
          return {
            ...savedObjective,
            department_name: savedObjective.department_name || obj.department_name,
            department_code: savedObjective.department_code || obj.department_code,
          };
        }
        return obj;
      }));
      
      toast({
        title: 'Success',
        description: 'Objective updated successfully',
      });
      
      // Force a re-render - filteredObjectives will update automatically via useMemo
      
      // Reload in background to ensure sync (non-blocking)
      loadData(false).catch(err => {
        console.warn('[DepartmentObjectives] Background reload failed:', err);
      });
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
      // Optimistically remove from UI immediately - use flushSync for instant re-render
      const deletedObjective = objectives.find(obj => obj.id === deletingId);
      flushSync(() => {
        setObjectives(prev => {
          const filtered = prev.filter(obj => obj.id !== deletingId);
          return filtered;
        });
        setDeletingId(null);
      });
      
      toast({
        title: 'Deleting...',
        description: 'Objective is being deleted',
      });
      
      // Delete from database
      await deleteDepartmentObjective(deletingId);
      
      // Ensure deletion is reflected (optimistic update already done, but double-check)
      setObjectives(prev => prev.filter(obj => obj.id !== deletingId));
      
      toast({
        title: 'Success',
        description: 'Objective deleted successfully',
      });
      
      // Force a re-render - filteredObjectives will update automatically via useMemo
      
      // Reload in background to ensure sync (non-blocking)
      loadData(false).catch(err => {
        console.warn('[DepartmentObjectives] Background reload failed:', err);
        // Restore on error
        if (deletedObjective) {
          setObjectives(prev => [...prev, deletedObjective]);
        }
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete objective',
        variant: 'destructive',
      });
      // Reload to get correct state on error
      loadData(false);
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
      if (!userData) {
        toast({
          title: 'Error',
          description: 'User not found. Please sign in again.',
          variant: 'destructive',
        });
        return;
      }
      
      const userObj = JSON.parse(userData);
      
      // Determine which department to use
      let departmentCode: string | undefined;
      if (userObj.role === 'CEO') {
        // CEO users should use selectedDepartment if set
        departmentCode = selectedDepartment || userObj.departments?.[0];
      } else {
        // Department users use their own department
        departmentCode = userObj.departments?.[0];
      }
      
      if (!departmentCode) {
        toast({
          title: 'Error',
          description: userObj.role === 'CEO' 
            ? 'Please select a department filter' 
            : 'Department not found in user profile',
          variant: 'destructive',
        });
        return;
      }
      
      // Find department by code (case-insensitive)
      const department = departments.find((d) => 
        d.code?.toLowerCase() === departmentCode?.toLowerCase()
      );
      
      if (!department) {
        console.error('[DepartmentObjectives] Department lookup failed:', {
          departmentCode,
          availableDepartments: departments.map(d => ({ code: d.code, name: d.name })),
          userDepartments: userObj.departments,
          userRole: userObj.role,
          selectedDepartment
        });
        toast({
          title: 'Error',
          description: `Department "${departmentCode}" not found. Please refresh the page.`,
          variant: 'destructive',
        });
        return;
      }

      // Optimistically add to UI immediately
      const tempId = Date.now();
      const optimisticObjective: DepartmentObjective = {
        id: tempId,
        department_id: department.id,
        kpi: joinKPIs(kpiArray),
        activity: newData.activity!,
        type: newData.type === 'blank' ? '' : newData.type!,
        activity_target: parseFloat(newData.activity_target!.toString()),
        target_type: 'number',
        responsible_person: newData.responsible_person!,
        mov: newData.mov!,
        main_objective_id: newData.main_objective_id || null,
        department_name: department.name,
        department_code: department.code,
        sort_order: objectives.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // Add optimistically to UI immediately
      flushSync(() => {
        setObjectives(prev => {
          const updated = [...prev, optimisticObjective];
          return updated.sort((a, b) => {
            if (a.sort_order !== undefined && b.sort_order !== undefined) {
              return a.sort_order - b.sort_order;
            }
            if (a.sort_order !== undefined) return -1;
            if (b.sort_order !== undefined) return 1;
            return a.id - b.id;
          });
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
      });
      
      toast({
        title: 'Creating...',
        description: 'Objective is being created',
      });
      
      // Save to database
      const savedObjective = await createDepartmentObjective({
        department_id: department.id,
        kpi: joinKPIs(kpiArray),
        activity: newData.activity!,
        type: newData.type === 'blank' ? '' : newData.type!,
        activity_target: parseFloat(newData.activity_target!.toString()),
        responsible_person: newData.responsible_person!,
        mov: newData.mov!,
        main_objective_id: newData.main_objective_id || null,
      });
      
      // Replace optimistic with real data - ensure all fields are present
      setObjectives(prev => {
        const updated = prev.map(obj => {
          if (obj.id === tempId) {
            // Ensure savedObjective has all required fields
            return {
              ...savedObjective,
              department_name: savedObjective.department_name || department.name,
              department_code: savedObjective.department_code || department.code,
            };
          }
          return obj;
        });
        return updated.sort((a, b) => {
          if (a.sort_order !== undefined && b.sort_order !== undefined) {
            return a.sort_order - b.sort_order;
          }
          if (a.sort_order !== undefined) return -1;
          if (b.sort_order !== undefined) return 1;
          return a.id - b.id;
        });
      });
      
      toast({
        title: 'Success',
        description: 'Objective created successfully',
      });
      
      // Force a re-render - filteredObjectives will update automatically via useMemo
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

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Get unique values for each column (handle multiple KPIs) - memoized for performance
  const uniqueKPIs = useMemo(() => 
    Array.from(new Set(
      objectives.flatMap(o => parseKPIs(o.kpi))
    )).sort(),
    [objectives]
  );
  const uniqueActivities = useMemo(() => 
    Array.from(new Set(objectives.map(o => o.activity).filter(Boolean))).sort(),
    [objectives]
  );
  const uniqueTypes = useMemo(() => 
    Array.from(new Set(objectives.map(o => o.type).filter(Boolean))).sort(),
    [objectives]
  );
  const uniqueTargets = useMemo(() => 
    Array.from(new Set(objectives.map(o => o.activity_target.toString()).filter(Boolean))).sort((a, b) => parseFloat(a) - parseFloat(b)),
    [objectives]
  );
  const uniqueResponsible = useMemo(() => 
    Array.from(new Set(objectives.map(o => o.responsible_person).filter(Boolean))).sort(),
    [objectives]
  );
  const uniqueMOVs = useMemo(() => 
    Array.from(new Set(objectives.map(o => o.mov).filter(Boolean))).sort(),
    [objectives]
  );
  
  // Get unique main objectives (with labels) - memoized for performance
  const uniqueMainObjectives = useMemo(() => {
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
    return Array.from(mainObjectiveMap.values()).sort();
  }, [objectives, mainObjectives]);

  // Filter objectives based on selected filter values
  // Use useMemo to ensure filteredObjectives updates reactively when objectives change
  const filteredObjectives = useMemo(() => {
    return objectives.filter((obj) => {
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
  }, [objectives, filters, mainObjectives]);

  // NOW we can do conditional returns - AFTER all hooks
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
            className={`h-auto px-2 py-1 ${hasFilter ? 'text-primary' : ''}`}
            aria-label={`Filter ${column}`}
            title={`Filter ${column}`}
          >
            <Filter className="h-3 w-3 mr-1.5" />
            <span className="text-xs">{column}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="min-w-64 max-w-[320px] w-auto p-0 max-h-[calc(100vh-8rem)]" 
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
        >
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
            <ScrollArea className="max-h-[calc(100vh-20rem)] min-h-[120px]">
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
      // Optimistically add to UI immediately - use flushSync for instant re-render
      const tempId = Date.now();
      const optimisticObjective: DepartmentObjective = {
        ...meDataToSave,
        id: tempId,
        department_name: selectedDepartment?.name || '',
        department_code: selectedDepartment?.code || '',
        sort_order: objectives.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as DepartmentObjective;
      
      flushSync(() => {
        setObjectives(prev => [...prev, optimisticObjective]);
      });
      
      // Save to database
      const savedObjective = await createDepartmentObjective(meDataToSave);
      
      // Replace optimistic with real data
      setObjectives(prev => prev.map(obj => 
        obj.id === tempId ? savedObjective : obj
      ));
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

  // Helper functions for hierarchical view
  const extractNumber = (text: string, pattern: RegExp): string => {
    const match = text.match(pattern);
    return match ? match[0] : '';
  };

  const TARGET_TO_OBJECTIVE_MAP: Record<string, string> = {
    '1.1': '1.1', '1.2': '1.2', '1.3': '1.3', '1.4': '1.4', '1.5': '1.5',
    '2.1': '2.1', '3.1': '3.1', '4.1': '4.1', '5.1': '5.1', '5.2': '5.2',
    '5.3': '5.3', '5.4': '5.4', '6.1': '6.1', '7.1': '7.1', '8.1': '8.1', '9.1': '9.1',
  };

  const generateHierarchicalNumbers = (data: HierarchicalPlan) => {
    const objNums = new Map<string, string>();
    const targetNums = new Map<string, string>();
    const kpiNums = new Map<string, string>();

    data.pillars.forEach((pillar) => {
      pillar.objectives.forEach((obj) => {
        const objKey = `${pillar.pillar}|${obj.objective}`;
        let objNum = '';
        if (obj.targets.length > 0) {
          const firstTarget = obj.targets[0];
          const targetNum = extractNumber(firstTarget.target, /^\d+(\.\d+)?/);
          if (targetNum) {
            objNum = TARGET_TO_OBJECTIVE_MAP[targetNum] || targetNum;
          }
        }
        if (!objNum) {
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
  };

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
      };
    }
  };

  // Create RASCI Map for lookup
  const rasciMap = new Map<string, RASCIWithExistence>();
  rasciMetrics.forEach(rasci => {
    if (rasci.role && rasci.role !== '—' && rasci.role.trim() !== '') {
      rasciMap.set(rasci.kpi, rasci);
    }
  });

  // Filter hierarchical plan to only include KPIs with RASCI data
  const filterHierarchyByRASCI = (hierarchical: HierarchicalPlan, rasciMap: Map<string, RASCIWithExistence>, filters: typeof rasciFilters): HierarchicalPlan => {
    const rasciWithRoles = Array.from(rasciMap.values()).filter(rasci => rasci.role && rasci.role !== '—' && rasci.role.trim() !== '');
    
    // Apply filters
    const filteredRASCI = rasciWithRoles.filter((rasci) => {
      const matchesKPI = filters.kpi.length === 0 || filters.kpi.includes(rasci.kpi);
      const matchesRole = filters.role.length === 0 || filters.role.includes(rasci.role);
      const existsLabel = rasci.exists_in_activities ? 'Exists' : 'Not exists';
      const matchesExists = filters.exists.length === 0 || filters.exists.includes(existsLabel);
      return matchesKPI && matchesRole && matchesExists;
    });
    
    const filteredKPISet = new Set(filteredRASCI.map(r => r.kpi));
    
    return {
      pillars: hierarchical.pillars.map(pillar => ({
        ...pillar,
        objectives: pillar.objectives.map(obj => ({
          ...obj,
          targets: obj.targets.map(target => ({
            ...target,
            kpis: target.kpis.filter(kpi => filteredKPISet.has(kpi.kpi))
          })).filter(target => target.kpis.length > 0)
        })).filter(obj => obj.targets.length > 0)
      })).filter(pillar => pillar.objectives.length > 0)
    };
  };

  // Filter hierarchical data
  const filteredHierarchical = hierarchicalData && rasciMap.size > 0 
    ? filterHierarchyByRASCI(hierarchicalData, rasciMap, rasciFilters)
    : null;

  // Generate numbers for filtered hierarchy
  const hierarchicalNumbers = filteredHierarchical ? generateHierarchicalNumbers(filteredHierarchical) : { objNums: new Map(), targetNums: new Map(), kpiNums: new Map() };

  const getObjNum = (pillar: string, objective: string): string => {
    const objKey = `${pillar}|${objective}`;
    return hierarchicalNumbers.objNums.get(objKey) || '';
  };

  const getTargetNum = (pillar: string, objective: string, target: string): string => {
    const objKey = `${pillar}|${objective}`;
    const targetKey = `${objKey}|${target}`;
    return hierarchicalNumbers.targetNums.get(targetKey) || '';
  };

  const getKpiNum = (pillar: string, objective: string, target: string, kpi: string): string => {
    const objKey = `${pillar}|${objective}`;
    const targetKey = `${objKey}|${target}`;
    const kpiKey = `${targetKey}|${kpi}`;
    return hierarchicalNumbers.kpiNums.get(kpiKey) || '';
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
                  <OptimizedImage 
                    src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                    sizes="48px"
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
                {activeTab === 'objectives' && filteredObjectives.length > 0 && (
                  <ExportButton
                    data={filteredObjectives
                      .filter(obj => obj.type !== 'M&E' && obj.type !== 'M&E MOV' && !obj.activity?.startsWith('[M&E]') && !obj.activity?.startsWith('[M&E-PARENT:'))
                      .map(obj => {
                        const parsedKPIs = parseKPIs(obj.kpi);
                        return {
                          'KPI': parsedKPIs.join(', '),
                          'Activity': obj.activity || '',
                          'Type': obj.type || '',
                          'Target': obj.activity_target || 0,
                          'Responsible Person': obj.responsible_person || '',
                          'MOV': obj.mov || '',
                        };
                      })}
                    filename={`department-objectives-${new Date().toISOString().split('T')[0]}`}
                    title="Department Objectives"
                  />
                )}
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
                handleOpenAddModal();
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
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: columnWidths.index, minWidth: columnWidths.index, position: 'relative' }} className="bg-primary/10">
                      <div className="flex items-center justify-center">
                        <span className="font-semibold text-primary">N</span>
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
                              <SortableRow key={obj.id} id={obj.id} isEditing={false}>
                                {({ attributes, listeners }) => {
                                  // Parse types for per-KPI display
                                  const parsedKPIs = parseKPIs(obj.kpi);
                                  const parsedTypes = obj.type.includes(TYPE_DELIMITER) 
                                    ? obj.type.split(TYPE_DELIMITER).filter(t => t.trim())
                                    : [obj.type];
                                  const firstType = parsedTypes[0] || obj.type;
                                  const allTypes = parsedKPIs.length > 1 && parsedTypes.length > 1
                                    ? parsedKPIs.map((kpi, idx) => `${kpi}: ${parsedTypes[idx] || parsedTypes[0] || 'Direct'}`).join(', ')
                                    : firstType;
                                  const showTooltip = parsedKPIs.length > 1 && parsedTypes.length > 1;
                                  
                                  // Format target with type
                                  const targetDisplay = obj.target_type === 'percentage'
                                    ? `${obj.activity_target.toLocaleString()}%`
                                    : obj.activity_target.toLocaleString();

                                  return (
                                    <>
                                      <TableCell style={{ width: columnWidths.index, minWidth: columnWidths.index }} className="text-center bg-primary/10">
                                        <div className="w-full h-full flex items-center justify-center">
                                          <span className="text-sm font-semibold text-primary">{index + 1}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-medium" style={{ width: columnWidths.kpi, minWidth: columnWidths.kpi }}>
                                        <div className="flex flex-wrap gap-1">
                                          {parsedKPIs.map((kpi, idx) => (
                                            <Badge key={idx} variant="outline" className="text-xs">
                                              <BidirectionalText>{kpi}</BidirectionalText>
                                            </Badge>
                                          ))}
                                        </div>
                                      </TableCell>
                                      <TableCell style={{ width: columnWidths.activity, minWidth: columnWidths.activity }}>
                                        <BidirectionalText>{obj.activity}</BidirectionalText>
                                      </TableCell>
                                      <TableCell style={{ width: columnWidths.type, minWidth: columnWidths.type }}>
                                        {showTooltip ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Badge variant={firstType === 'Direct' ? 'default' : 'secondary'}>
                                                  {firstType}
                                                </Badge>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>{allTypes}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : (
                                          <Badge variant={firstType === 'Direct' ? 'default' : 'secondary'}>
                                            {firstType}
                                          </Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right" style={{ width: columnWidths.target, minWidth: columnWidths.target }}>
                                        {targetDisplay}
                                      </TableCell>
                                      <TableCell style={{ width: columnWidths.responsible, minWidth: columnWidths.responsible }}>
                                        <BidirectionalText>{obj.responsible_person}</BidirectionalText>
                                      </TableCell>
                                      <TableCell style={{ width: columnWidths.mov, minWidth: columnWidths.mov }}>
                                        <BidirectionalText>{obj.mov}</BidirectionalText>
                                      </TableCell>
                                      <TableCell className="text-right" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                            <div className="flex justify-end gap-2">
                              {meKPIsForObjective.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  data-no-drag
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleOpenMEModal(obj);
                                  }}
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
                                  data-no-drag
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
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
                              <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                <MonthlyDataEditor 
                                  departmentObjectiveId={obj.id}
                                  trigger={
                                    <Button 
                                      type="button" 
                                      size="sm" 
                                      variant="outline" 
                                      data-no-drag
                                      aria-label="Edit monthly data" 
                                      title="Edit monthly data"
                                    >
                                      <Calendar className="h-4 w-4" />
                                    </Button>
                                  }
                                />
                              </div>
                              <Button 
                                type="button" 
                                size="sm" 
                                variant="outline" 
                                data-no-drag
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  startEdit(obj);
                                }}
                                aria-label={`Edit objective ${obj.id}`} 
                                title="Edit objective"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button 
                                type="button" 
                                size="sm" 
                                variant="outline" 
                                data-no-drag
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDeletingId(obj.id);
                                }}
                                aria-label={`Delete objective ${obj.id}`} 
                                title="Delete objective"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                                </div>
                              </TableCell>
                                    </>
                                  );
                                }}
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
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>RASCI Metrics</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <ExcelFilter
                  filterId="rasci-kpi"
                  column="KPI"
                  uniqueValues={uniqueRasciKPIs}
                  selectedValues={rasciFilters.kpi}
                  onToggle={(value) => toggleRasciFilterValue('kpi', value)}
                  onClear={() => clearRasciFilter('kpi')}
                />
                <ExcelFilter
                  filterId="rasci-role"
                  column="Role"
                  uniqueValues={uniqueRasciRoles}
                  selectedValues={rasciFilters.role}
                  onToggle={(value) => toggleRasciFilterValue('role', value)}
                  onClear={() => clearRasciFilter('role')}
                />
                <ExcelFilter
                  filterId="rasci-exists"
                  column="Exists"
                  uniqueValues={uniqueRasciExists}
                  selectedValues={rasciFilters.exists}
                  onToggle={(value) => toggleRasciFilterValue('exists', value)}
                  onClear={() => clearRasciFilter('exists')}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!filteredHierarchical || filteredHierarchical.pillars.length === 0 ? (
              <Card className="border-2 border-border">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">
                    No RASCI metrics with assigned roles found for this department.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6 p-2">
                {(() => {
                  const pillarOrder = ['Strategic Themes', 'Contributors', 'Strategic Enablers'];
                  const sortedPillars = [...filteredHierarchical.pillars].sort((a, b) => {
                    const aIndex = pillarOrder.indexOf(a.pillar);
                    const bIndex = pillarOrder.indexOf(b.pillar);
                    if (aIndex === -1 && bIndex === -1) return 0;
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;
                    return aIndex - bIndex;
                  });

                  return sortedPillars.map((pillar, pillarIndex) => {
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
                        <div className="absolute inset-0 opacity-5">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-3xl"></div>
                          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-white/20 to-transparent rounded-full blur-3xl"></div>
                        </div>
                        
                        <Accordion type="single" collapsible className="w-full relative z-10" defaultValue={`pillar-${pillarIndex}`}>
                          <AccordionItem value={`pillar-${pillarIndex}`} className="border-none">
                            <AccordionTrigger className="px-6 py-5 hover:no-underline group">
                              <div className="flex items-center gap-4 w-full">
                                <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border} group-hover:scale-110 transition-transform duration-200`}>
                                  <Layers className={`h-6 w-6 ${colors.icon}`} />
                                </div>
                                <div className="flex-1 text-left">
                                  <h2 className={`text-2xl font-bold ${colors.text} mb-1`}>{pillar.pillar}</h2>
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
                                      <Accordion type="single" collapsible defaultValue={`objective-${pillarIndex}-${objIndex}`}>
                                        <AccordionItem value={`objective-${pillarIndex}-${objIndex}`} className="border-none">
                                          <AccordionTrigger className="px-5 py-4 hover:no-underline group">
                                            <div className="flex items-center gap-3 w-full">
                                              <div className={`px-3 py-1.5 rounded-lg ${colors.bg} border ${colors.border} font-mono text-sm font-bold ${colors.text} group-hover:scale-105 transition-transform`}>
                                                {objNum}
                                              </div>
                                              <div className="flex-1 text-left">
                                                <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                                                  {objText}
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
                                                    <Accordion type="single" collapsible defaultValue={`target-${pillarIndex}-${objIndex}-${targetIndex}`}>
                                                      <AccordionItem value={`target-${pillarIndex}-${objIndex}-${targetIndex}`} className="border-none">
                                                        <AccordionTrigger className="px-4 py-3 hover:no-underline group">
                                                          <div className="flex items-center gap-3 w-full">
                                                            <div className={`px-2.5 py-1 rounded-md ${colors.bg} border ${colors.border} font-mono text-xs font-semibold ${colors.text}`}>
                                                              {targetNum}
                                                            </div>
                                                            <div className="flex-1 text-left">
                                                              <h4 className="text-base font-medium text-foreground group-hover:text-primary transition-colors">
                                                                {targetText}
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
                                                              const kpiNum = getKpiNum(pillar.pillar, objective.objective, target.target, kpi.kpi);
                                                              const kpiText = kpi.kpi.replace(/^\d+(\.\d+)*(\.\d+)?\s*/, '') || kpi.kpi;
                                                              const rasciData = rasciMap.get(kpi.kpi);
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
                                                                          {kpiText}
                                                                        </h5>
                                                                        {rasciData && (
                                                                          <>
                                                                            <Badge variant="outline" className="border-primary/30">
                                                                              {rasciData.role}
                                                                            </Badge>
                                                                            {rasciData.exists_in_activities ? (
                                                                              <Badge variant="default" className="bg-green-600">
                                                                                Exists
                                                                              </Badge>
                                                                            ) : (
                                                                              <Badge variant="destructive">
                                                                                Not exists
                                                                              </Badge>
                                                                            )}
                                                                          </>
                                                                        )}
                                                                        <Badge className={`${colors.badge} border font-medium`}>
                                                                          <Target className="h-3 w-3 mr-1" />
                                                                          {kpi.annual_target.toLocaleString()}
                                                                        </Badge>
                                                                      </div>
                                                                    </div>
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
                  });
                })()}
              </div>
            )}
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

        {/* Objective Form Modal */}
        <ObjectiveFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          mode={modalMode}
          initialData={modalInitialData}
          onSave={handleModalSave}
          existingResponsiblePersons={uniqueResponsible}
        />
      </div>
    </div>
  );
}

