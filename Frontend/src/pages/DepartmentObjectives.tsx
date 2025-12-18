import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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
} from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import KPISelector from '@/components/wig/KPISelector';
import MonthlyDataEditor from '@/components/wig/MonthlyDataEditor';
import type { DepartmentObjective, MainPlanObjective, Department } from '@/types/wig';
import { LogOut, Plus, Edit2, Trash2, Calendar, Loader2, RefreshCw, Filter, X } from 'lucide-react';
import NavigationBar from '@/components/shared/NavigationBar';

interface MEEKPI {
  id?: number;
  me_kpi: string;
  mov: string;
}

export default function DepartmentObjectives() {
  const [user, setUser] = useState<any>(null);
  const [objectives, setObjectives] = useState<DepartmentObjective[]>([]);
  const [mainObjectives, setMainObjectives] = useState<MainPlanObjective[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingME, setIsAddingME] = useState(false);
  const [meKPIs, setMeKPIs] = useState<MEEKPI[]>([]);
  const [newMEKPI, setNewMEKPI] = useState<MEEKPI>({ me_kpi: '', mov: '' });
  const [editData, setEditData] = useState<Partial<DepartmentObjective>>({});
  const [newData, setNewData] = useState<Partial<DepartmentObjective>>({
    kpi: '',
    activity: '',
    type: 'Direct',
    activity_target: 0,
    responsible_person: '',
    mov: '',
    main_objective_id: null,
  });
  
  // Filter states for Excel-like filtering
  const [filters, setFilters] = useState({
    kpi: '',
    activity: '',
    type: '',
    target: '',
    responsible: '',
    mov: '',
    mainObjective: '',
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    if (userObj.role !== 'department') {
      navigate('/access-denied');
      return;
    }

    setUser(userObj);
    loadData();
  }, [navigate]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const userData = localStorage.getItem('user');
      if (!userData) return;
      
      const userObj = JSON.parse(userData);
      const departmentCode = userObj.departments?.[0];
      
      const [deptObjectives, mainObjs, depts] = await Promise.all([
        getDepartmentObjectives({ department_code: departmentCode }),
        getMainObjectives(),
        getDepartments(),
      ]);
      
      setObjectives(deptObjectives);
      setMainObjectives(mainObjs);
      setDepartments(depts);
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

  const saveEdit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingId) return;

    try {
      await updateDepartmentObjective(editingId, editData);
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
    if (!newData.kpi || !newData.activity || !newData.activity_target || !newData.responsible_person || !newData.mov) {
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
        kpi: newData.kpi!,
        activity: newData.activity!,
        type: newData.type!,
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
        kpi: '',
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

  // Filter objectives based on filter values
  const filteredObjectives = objectives.filter((obj) => {
    const matchesKPI = !filters.kpi || obj.kpi.toLowerCase().includes(filters.kpi.toLowerCase());
    const matchesActivity = !filters.activity || obj.activity.toLowerCase().includes(filters.activity.toLowerCase());
    const matchesType = !filters.type || obj.type === filters.type || (filters.type === '' && !obj.type);
    const matchesTarget = !filters.target || obj.activity_target.toString().includes(filters.target);
    const matchesResponsible = !filters.responsible || obj.responsible_person.toLowerCase().includes(filters.responsible.toLowerCase());
    const matchesMOV = !filters.mov || obj.mov.toLowerCase().includes(filters.mov.toLowerCase());
    const mainObj = mainObjectives.find((o) => o.id === obj.main_objective_id);
    const matchesMainObjective = !filters.mainObjective || 
      (mainObj && (mainObj.objective.toLowerCase().includes(filters.mainObjective.toLowerCase()) || 
                   mainObj.kpi.toLowerCase().includes(filters.mainObjective.toLowerCase()))) ||
      (!obj.main_objective_id && filters.mainObjective.toLowerCase().includes('not linked'));
    
    return matchesKPI && matchesActivity && matchesType && matchesTarget && 
           matchesResponsible && matchesMOV && matchesMainObjective;
  });

  // Get unique values for filter dropdowns
  const uniqueTypes = Array.from(new Set(objectives.map(o => o.type).filter(Boolean)));
  const uniqueMainObjectives = mainObjectives.map(o => o.objective);

  const clearFilter = (filterKey: keyof typeof filters) => {
    setFilters({ ...filters, [filterKey]: '' });
  };

  const handleAddMEKPI = async () => {
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

      // Store M&E KPI as a department objective with special activity marker
      await createDepartmentObjective({
        department_id: department.id,
        kpi: newMEKPI.me_kpi,
        activity: '[M&E] ' + newMEKPI.me_kpi, // Mark as M&E
        type: 'M&E' as any, // Use M&E type
        activity_target: 0,
        responsible_person: '',
        mov: newMEKPI.mov,
        main_objective_id: null,
      });
      
      toast({
        title: 'Success',
        description: 'M&E KPI created successfully',
      });
      
      setIsAddingME(false);
      setNewMEKPI({ me_kpi: '', mov: '' });
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Department Objectives</CardTitle>
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Objective
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead>Responsible</TableHead>
                    <TableHead>MOV</TableHead>
                    <TableHead>Main Objective</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                  {/* Filter Row */}
                  <TableRow className="bg-muted/50">
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter KPI..."
                          value={filters.kpi}
                          onChange={(e) => setFilters({ ...filters, kpi: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {filters.kpi && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('kpi')}
                            aria-label="Clear KPI filter"
                            title="Clear KPI filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter Activity..."
                          value={filters.activity}
                          onChange={(e) => setFilters({ ...filters, activity: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {filters.activity && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('activity')}
                            aria-label="Clear Activity filter"
                            title="Clear Activity filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex gap-1">
                        <Select
                          value={filters.type || 'all'}
                          onValueChange={(value) => setFilters({ ...filters, type: value === 'all' ? '' : value })}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Filter Type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {uniqueTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {filters.type && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => clearFilter('type')}
                            aria-label="Clear Type filter"
                            title="Clear Type filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter Target..."
                          value={filters.target}
                          onChange={(e) => setFilters({ ...filters, target: e.target.value })}
                          className="h-8 text-xs text-right"
                          type="number"
                        />
                        {filters.target && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('target')}
                            aria-label="Clear Target filter"
                            title="Clear Target filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter Responsible..."
                          value={filters.responsible}
                          onChange={(e) => setFilters({ ...filters, responsible: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {filters.responsible && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('responsible')}
                            aria-label="Clear Responsible filter"
                            title="Clear Responsible filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter MOV..."
                          value={filters.mov}
                          onChange={(e) => setFilters({ ...filters, mov: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {filters.mov && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('mov')}
                            aria-label="Clear MOV filter"
                            title="Clear MOV filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="relative">
                        <Input
                          placeholder="Filter Main Objective..."
                          value={filters.mainObjective}
                          onChange={(e) => setFilters({ ...filters, mainObjective: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {filters.mainObjective && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-8 w-8 p-0"
                            onClick={() => clearFilter('mainObjective')}
                            aria-label="Clear Main Objective filter"
                            title="Clear Main Objective filter"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isAdding && (
                    <TableRow>
                      <TableCell>
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
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={newData.type}
                          onValueChange={(value: 'Direct' | 'In direct') => setNewData({ ...newData, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Direct">Direct</SelectItem>
                            <SelectItem value="In direct">In direct</SelectItem>
                            <SelectItem value="M&E">M&E</SelectItem>
                            <SelectItem value="">Blank</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={newData.activity_target || ''}
                          onChange={(e) => setNewData({ ...newData, activity_target: parseFloat(e.target.value) || 0 })}
                          placeholder="Target"
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={newData.responsible_person || ''}
                          onChange={(e) => setNewData({ ...newData, responsible_person: e.target.value })}
                          placeholder="Responsible Person"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={newData.mov || ''}
                          onChange={(e) => setNewData({ ...newData, mov: e.target.value })}
                          placeholder="MOV"
                        />
                      </TableCell>
                          <TableCell>
                            <Select
                              value={newData.main_objective_id?.toString() || 'none'}
                              onValueChange={(value) => setNewData({ ...newData, main_objective_id: value === 'none' ? null : parseInt(value) })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Link to Main Objective" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {mainObjectives.map((obj) => (
                                  <SelectItem key={obj.id} value={obj.id.toString()}>
                                    {obj.objective} - {obj.kpi}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                      <TableCell className="text-right">
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

                  {filteredObjectives.map((obj) => (
                    <TableRow key={obj.id}>
                      {editingId === obj.id ? (
                        <>
                          <TableCell>
                            <KPISelector
                              value={editData.kpi || obj.kpi}
                              onValueChange={(value) => setEditData({ ...editData, kpi: value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.activity || obj.activity}
                              onChange={(e) => setEditData({ ...editData, activity: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={editData.type || obj.type}
                              onValueChange={(value: 'Direct' | 'In direct') => setEditData({ ...editData, type: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Direct">Direct</SelectItem>
                                <SelectItem value="In direct">In direct</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editData.activity_target?.toString() || obj.activity_target.toString()}
                              onChange={(e) => setEditData({ ...editData, activity_target: parseFloat(e.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.responsible_person || obj.responsible_person}
                              onChange={(e) => setEditData({ ...editData, responsible_person: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.mov || obj.mov}
                              onChange={(e) => setEditData({ ...editData, mov: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={editData.main_objective_id?.toString() || obj.main_objective_id?.toString() || 'none'}
                              onValueChange={(value) => setEditData({ ...editData, main_objective_id: value === 'none' ? null : parseInt(value) })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Link to Main Objective" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {mainObjectives.map((mainObj) => (
                                  <SelectItem key={mainObj.id} value={mainObj.id.toString()}>
                                    {mainObj.objective} - {mainObj.kpi}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
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
                          <TableCell className="font-medium">{obj.kpi}</TableCell>
                          <TableCell>{obj.activity}</TableCell>
                          <TableCell>
                            <Badge variant={obj.type === 'Direct' ? 'default' : 'secondary'}>
                              {obj.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{obj.activity_target.toLocaleString()}</TableCell>
                          <TableCell>{obj.responsible_person}</TableCell>
                          <TableCell>{obj.mov}</TableCell>
                          <TableCell>
                            {obj.main_objective_id
                              ? mainObjectives.find((o) => o.id === obj.main_objective_id)?.objective || 'N/A'
                              : 'Not linked'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* M&E KPIs Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>M&E KPIs</CardTitle>
              <Button onClick={() => setIsAddingME(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add M&E KPI
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>M&E KPI</TableHead>
                    <TableHead>MOV</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isAddingME && (
                    <TableRow>
                      <TableCell>
                        <Input
                          value={newMEKPI.me_kpi}
                          onChange={(e) => setNewMEKPI({ ...newMEKPI, me_kpi: e.target.value })}
                          placeholder="M&E KPI"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={newMEKPI.mov}
                          onChange={(e) => setNewMEKPI({ ...newMEKPI, mov: e.target.value })}
                          placeholder="MOV"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" onClick={handleAddMEKPI}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setIsAddingME(false)}>
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  
                  {/* Display M&E KPIs (objectives with type='M&E' or activity starting with '[M&E]') */}
                  {filteredObjectives
                    .filter(obj => obj.type === 'M&E' || obj.activity?.startsWith('[M&E]'))
                    .map((obj) => (
                      <TableRow key={obj.id}>
                        <TableCell className="font-medium">
                          {obj.type === 'M&E' || obj.activity?.startsWith('[M&E]') ? obj.kpi : obj.activity?.replace('[M&E] ', '')}
                        </TableCell>
                        <TableCell>{obj.mov}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              type="button" 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setDeletingId(obj.id)}
                              aria-label={`Delete M&E KPI ${obj.id}`}
                              title="Delete M&E KPI"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  
                  {filteredObjectives.filter(obj => obj.type === 'M&E' || obj.activity?.startsWith('[M&E]')).length === 0 && !isAddingME && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No M&E KPIs found. Click "Add M&E KPI" to add one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
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
      </div>
    </div>
  );
}

