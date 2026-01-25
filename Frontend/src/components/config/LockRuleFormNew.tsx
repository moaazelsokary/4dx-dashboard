import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { createLock, updateLock, getUsers, getKPIsByUsers, getObjectivesByKPIs, type FieldLock, type LockRuleFormData, type User } from '@/services/configService';
import { getDepartmentObjectives } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { Loader2, Search, X, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LockRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lock?: FieldLock | null;
  onSuccess: () => void;
}

export default function LockRuleForm({ open, onOpenChange, lock, onSuccess }: LockRuleFormProps) {
  const queryClient = useQueryClient();
  
  // Hierarchical selection state
  const [userScope, setUserScope] = useState<'all' | 'specific' | 'none'>('all');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [kpiScope, setKpiScope] = useState<'all' | 'specific' | 'none'>('all');
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);
  const [objectiveScope, setObjectiveScope] = useState<'all' | 'specific' | 'none'>('all');
  const [selectedObjectives, setSelectedObjectives] = useState<number[]>([]);
  
  // Field locks
  const [lockAnnualTarget, setLockAnnualTarget] = useState(false);
  const [lockMonthlyTarget, setLockMonthlyTarget] = useState(false);
  const [lockMonthlyActual, setLockMonthlyActual] = useState(false);
  const [lockAllOtherFields, setLockAllOtherFields] = useState(false);
  const [lockAddObjective, setLockAddObjective] = useState(false);
  const [lockDeleteObjective, setLockDeleteObjective] = useState(false);
  
  // UI state
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSelectOpen, setUserSelectOpen] = useState(false);
  const [kpiSearchTerm, setKpiSearchTerm] = useState('');
  const [kpiSelectOpen, setKpiSelectOpen] = useState(false);
  const [objectiveSearchTerm, setObjectiveSearchTerm] = useState('');
  const [objectiveSelectOpen, setObjectiveSelectOpen] = useState(false);

  // Load all users
  const { data: users = [] } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => getUsers(),
    enabled: open,
  });

  // Load all KPIs (for when user scope is 'all' or 'none')
  const { data: allKPIs = [] } = useQuery({
    queryKey: ['all-kpis'],
    queryFn: async () => {
      // Get all unique KPIs from department objectives
      const objectives = await getDepartmentObjectives();
      const kpiSet = new Set<string>();
      objectives.forEach(obj => {
        if (obj.kpi) {
          // Handle multiple KPIs separated by ||
          if (obj.kpi.includes('||')) {
            obj.kpi.split('||').forEach(k => kpiSet.add(k.trim()));
          } else {
            kpiSet.add(obj.kpi.trim());
          }
        }
      });
      return Array.from(kpiSet).sort();
    },
    enabled: open && (userScope === 'all' || userScope === 'none'),
  });

  // Load KPIs filtered by selected users
  const { data: userFilteredKPIs = [], isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis-by-users', selectedUsers],
    queryFn: () => getKPIsByUsers(selectedUsers),
    enabled: open && userScope === 'specific' && selectedUsers.length > 0,
  });

  // Use appropriate KPI list based on user scope
  const availableKPIs = userScope === 'specific' ? userFilteredKPIs : allKPIs;

  // Load all objectives (for when KPI scope is 'all' or 'none')
  const { data: allObjectives = [] } = useQuery({
    queryKey: ['all-objectives'],
    queryFn: async () => {
      const objectives = await getDepartmentObjectives();
      return objectives.map(obj => ({
        id: obj.id,
        activity: obj.activity,
        kpi: obj.kpi,
        responsible_person: obj.responsible_person,
        type: obj.type || '',
        department_id: obj.department_id
      }));
    },
    enabled: open && (kpiScope === 'all' || kpiScope === 'none'),
  });

  // Load objectives filtered by selected KPIs (and optionally users)
  const { data: kpiFilteredObjectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ['objectives-by-kpis', selectedKPIs, selectedUsers],
    queryFn: () => getObjectivesByKPIs(selectedKPIs, userScope === 'specific' ? selectedUsers : undefined),
    enabled: open && kpiScope === 'specific' && selectedKPIs.length > 0,
  });

  // Use appropriate objective list based on KPI scope
  const availableObjectives = kpiScope === 'specific' ? kpiFilteredObjectives : allObjectives;

  const createMutation = useMutation({
    mutationFn: (data: LockRuleFormData) => createLock(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lockStatus'], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['batchLockStatus'], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ['lockStatus'], type: 'active' });
      await queryClient.refetchQueries({ queryKey: ['batchLockStatus'], type: 'active' });
      toast({
        title: 'Success',
        description: 'Lock rule created successfully',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create lock rule',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LockRuleFormData> }) => updateLock(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lockStatus'], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['batchLockStatus'], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ['lockStatus'], type: 'active' });
      await queryClient.refetchQueries({ queryKey: ['batchLockStatus'], type: 'active' });
      toast({
        title: 'Success',
        description: 'Lock rule updated successfully',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update lock rule',
        variant: 'destructive',
      });
    },
  });

  // Initialize form when lock is provided
  useEffect(() => {
    if (lock && open) {
      setUserScope(lock.user_scope || 'all');
      setSelectedUsers(lock.user_ids || []);
      setKpiScope(lock.kpi_scope || 'all');
      setSelectedKPIs(lock.kpi_ids || []);
      setObjectiveScope(lock.objective_scope || 'all');
      setSelectedObjectives(lock.objective_ids || []);
      setLockAnnualTarget(lock.lock_annual_target || false);
      setLockMonthlyTarget(lock.lock_monthly_target || false);
      setLockMonthlyActual(lock.lock_monthly_actual || false);
      setLockAllOtherFields(lock.lock_all_other_fields || false);
      setLockAddObjective(lock.lock_add_objective || false);
      setLockDeleteObjective(lock.lock_delete_objective || false);
    } else if (open && !lock) {
      // Reset form for new lock
      setUserScope('all');
      setSelectedUsers([]);
      setKpiScope('all');
      setSelectedKPIs([]);
      setObjectiveScope('all');
      setSelectedObjectives([]);
      setLockAnnualTarget(false);
      setLockMonthlyTarget(false);
      setLockMonthlyActual(false);
      setLockAllOtherFields(false);
      setLockAddObjective(false);
      setLockDeleteObjective(false);
    }
  }, [lock, open]);

  // Reset KPI selection when user scope changes
  useEffect(() => {
    if (userScope !== 'specific') {
      setSelectedKPIs([]);
      setKpiScope('all');
    }
  }, [userScope]);

  // Reset objective selection when KPI scope changes
  useEffect(() => {
    if (kpiScope !== 'specific') {
      setSelectedObjectives([]);
      setObjectiveScope('all');
    }
  }, [kpiScope]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (userScope === 'specific' && selectedUsers.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one user',
        variant: 'destructive',
      });
      return;
    }

    if (kpiScope === 'specific' && selectedKPIs.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one KPI',
        variant: 'destructive',
      });
      return;
    }

    if (objectiveScope === 'specific' && selectedObjectives.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one objective',
        variant: 'destructive',
      });
      return;
    }

    // Check at least one field is locked
    if (!lockAnnualTarget && !lockMonthlyTarget && !lockMonthlyActual && 
        !lockAllOtherFields && !lockAddObjective && !lockDeleteObjective) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least one field to lock',
        variant: 'destructive',
      });
      return;
    }

    const formData: LockRuleFormData = {
      scope_type: 'hierarchical',
      user_scope: userScope,
      user_ids: userScope === 'specific' ? selectedUsers : undefined,
      kpi_scope: kpiScope,
      kpi_ids: kpiScope === 'specific' ? selectedKPIs : undefined,
      objective_scope: objectiveScope,
      objective_ids: objectiveScope === 'specific' ? selectedObjectives : undefined,
      lock_annual_target: lockAnnualTarget,
      lock_monthly_target: lockMonthlyTarget,
      lock_monthly_actual: lockMonthlyActual,
      lock_all_other_fields: lockAllOtherFields,
      lock_add_objective: lockAddObjective,
      lock_delete_objective: lockDeleteObjective,
    };

    if (lock?.id) {
      updateMutation.mutate({ id: lock.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const filteredKPIs = availableKPIs.filter(kpi =>
    kpi.toLowerCase().includes(kpiSearchTerm.toLowerCase())
  );

  const filteredObjectives = availableObjectives.filter(obj =>
    obj.activity.toLowerCase().includes(objectiveSearchTerm.toLowerCase()) ||
    obj.kpi.toLowerCase().includes(objectiveSearchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lock ? 'Edit Lock Rule' : 'Create Lock Rule'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info message */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
            <Info className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Hierarchical Lock Rule:</strong> Select users → KPIs (filtered by users) → Objectives (filtered by KPIs). 
              Locks only apply to Direct type objectives.
            </p>
          </div>

          {/* Step 1: User Selection */}
          <div className="space-y-3">
            <Label>Step 1: Select Users</Label>
            <RadioGroup value={userScope} onValueChange={(value) => setUserScope(value as 'all' | 'specific' | 'none')}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="user-all" />
                  <Label htmlFor="user-all" className="font-normal cursor-pointer">All Users</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="user-specific" />
                  <Label htmlFor="user-specific" className="font-normal cursor-pointer">Specific Users</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="user-none" />
                  <Label htmlFor="user-none" className="font-normal cursor-pointer">No Users (skip user filter)</Label>
                </div>
              </div>
            </RadioGroup>

            {userScope === 'specific' && (
              <Popover open={userSelectOpen} onOpenChange={setUserSelectOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedUsers.length > 0
                      ? `${selectedUsers.length} user(s) selected`
                      : 'Select users...'}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-1 p-2">
                        {filteredUsers.map((user) => {
                          const isSelected = selectedUsers.includes(user.id);
                          return (
                            <div
                              key={user.id}
                              className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                } else {
                                  setSelectedUsers([...selectedUsers, user.id]);
                                }
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <span className="text-sm flex-1">{user.username}</span>
                              <Badge variant="outline" className="text-xs">{user.role}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((userId) => {
                  const user = users.find(u => u.id === userId);
                  return (
                    <Badge key={userId} variant="secondary" className="gap-1">
                      {user?.username}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => setSelectedUsers(selectedUsers.filter(id => id !== userId))}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: KPI Selection */}
          <div className="space-y-3">
            <Label>Step 2: Select KPIs {userScope === 'specific' && selectedUsers.length > 0 && '(filtered by selected users)'}</Label>
            <RadioGroup value={kpiScope} onValueChange={(value) => setKpiScope(value as 'all' | 'specific' | 'none')}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="kpi-all" />
                  <Label htmlFor="kpi-all" className="font-normal cursor-pointer">All KPIs</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="kpi-specific" disabled={userScope === 'specific' && selectedUsers.length === 0} />
                  <Label htmlFor="kpi-specific" className="font-normal cursor-pointer">
                    Specific KPIs {userScope === 'specific' && selectedUsers.length === 0 && '(select users first)'}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="kpi-none" />
                  <Label htmlFor="kpi-none" className="font-normal cursor-pointer">No KPIs (skip KPI filter)</Label>
                </div>
              </div>
            </RadioGroup>

            {kpiScope === 'specific' && (
              <>
                {kpisLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading KPIs...
                  </div>
                ) : (
                  <Popover open={kpiSelectOpen} onOpenChange={setKpiSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={userScope === 'specific' && selectedUsers.length === 0}>
                        {selectedKPIs.length > 0
                          ? `${selectedKPIs.length} KPI(s) selected`
                          : 'Select KPIs...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[500px] p-0" align="start">
                      <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search KPIs..."
                            value={kpiSearchTerm}
                            onChange={(e) => setKpiSearchTerm(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-1 p-2">
                            {filteredKPIs.length === 0 ? (
                              <div className="text-sm text-muted-foreground p-4 text-center">
                                {userScope === 'specific' && selectedUsers.length === 0
                                  ? 'Please select users first'
                                  : 'No KPIs found'}
                              </div>
                            ) : (
                              filteredKPIs.map((kpi) => {
                                const isSelected = selectedKPIs.includes(kpi);
                                return (
                                  <div
                                    key={kpi}
                                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedKPIs(selectedKPIs.filter(k => k !== kpi));
                                      } else {
                                        setSelectedKPIs([...selectedKPIs, kpi]);
                                      }
                                    }}
                                  >
                                    <Checkbox checked={isSelected} />
                                    <span className="text-sm flex-1">{kpi}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {selectedKPIs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedKPIs.map((kpi) => (
                      <Badge key={kpi} variant="secondary" className="gap-1">
                        {kpi}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => setSelectedKPIs(selectedKPIs.filter(k => k !== kpi))}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 3: Objective Selection */}
          <div className="space-y-3">
            <Label>Step 3: Select Objectives {kpiScope === 'specific' && selectedKPIs.length > 0 && '(filtered by selected KPIs)'}</Label>
            <RadioGroup value={objectiveScope} onValueChange={(value) => setObjectiveScope(value as 'all' | 'specific' | 'none')}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="obj-all" />
                  <Label htmlFor="obj-all" className="font-normal cursor-pointer">All Objectives</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="obj-specific" disabled={kpiScope === 'specific' && selectedKPIs.length === 0} />
                  <Label htmlFor="obj-specific" className="font-normal cursor-pointer">
                    Specific Objectives {kpiScope === 'specific' && selectedKPIs.length === 0 && '(select KPIs first)'}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="obj-none" />
                  <Label htmlFor="obj-none" className="font-normal cursor-pointer">No Objectives (skip objective filter)</Label>
                </div>
              </div>
            </RadioGroup>

            {objectiveScope === 'specific' && (
              <>
                {objectivesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading objectives...
                  </div>
                ) : (
                  <Popover open={objectiveSelectOpen} onOpenChange={setObjectiveSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={kpiScope === 'specific' && selectedKPIs.length === 0}>
                        {selectedObjectives.length > 0
                          ? `${selectedObjectives.length} objective(s) selected`
                          : 'Select objectives...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[600px] p-0" align="start">
                      <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search objectives..."
                            value={objectiveSearchTerm}
                            onChange={(e) => setObjectiveSearchTerm(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-1 p-2">
                            {filteredObjectives.length === 0 ? (
                              <div className="text-sm text-muted-foreground p-4 text-center">
                                {kpiScope === 'specific' && selectedKPIs.length === 0
                                  ? 'Please select KPIs first'
                                  : 'No objectives found'}
                              </div>
                            ) : (
                              filteredObjectives.map((obj) => {
                                const isSelected = selectedObjectives.includes(obj.id);
                                return (
                                  <div
                                    key={obj.id}
                                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedObjectives(selectedObjectives.filter(id => id !== obj.id));
                                      } else {
                                        setSelectedObjectives([...selectedObjectives, obj.id]);
                                      }
                                    }}
                                  >
                                    <Checkbox checked={isSelected} />
                                    <div className="flex-1 text-sm">
                                      <div className="font-medium">{obj.activity}</div>
                                      <div className="text-xs text-muted-foreground">
                                        KPI: {obj.kpi} | Type: {obj.type} | Responsible: {obj.responsible_person}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {selectedObjectives.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedObjectives.map((objId) => {
                      const obj = availableObjectives.find(o => o.id === objId);
                      return (
                        <Badge key={objId} variant="secondary" className="gap-1">
                          {obj?.activity || `Objective ${objId}`}
                          <X
                            className="w-3 h-3 cursor-pointer"
                            onClick={() => setSelectedObjectives(selectedObjectives.filter(id => id !== objId))}
                          />
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 4: Fields to Lock */}
          <div className="space-y-3">
            <Label>Step 4: Select Fields to Lock</Label>
            <div className="space-y-3 p-4 border rounded-md">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-annual-target"
                  checked={lockAnnualTarget}
                  onCheckedChange={(checked) => setLockAnnualTarget(checked === true)}
                />
                <Label htmlFor="lock-annual-target" className="font-normal cursor-pointer">
                  1. Annual Target (activity_target)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-monthly-target"
                  checked={lockMonthlyTarget}
                  onCheckedChange={(checked) => setLockMonthlyTarget(checked === true)}
                />
                <Label htmlFor="lock-monthly-target" className="font-normal cursor-pointer">
                  2. Monthly Target
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-monthly-actual"
                  checked={lockMonthlyActual}
                  onCheckedChange={(checked) => setLockMonthlyActual(checked === true)}
                />
                <Label htmlFor="lock-monthly-actual" className="font-normal cursor-pointer">
                  3. Monthly Actual <span className="text-xs text-orange-600 font-medium">(Direct type ONLY)</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-all-other-fields"
                  checked={lockAllOtherFields}
                  onCheckedChange={(checked) => setLockAllOtherFields(checked === true)}
                />
                <Label htmlFor="lock-all-other-fields" className="font-normal cursor-pointer">
                  4. All Other Department Objectives Fields (activity, responsible_person, mov, etc.)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-add-objective"
                  checked={lockAddObjective}
                  onCheckedChange={(checked) => setLockAddObjective(checked === true)}
                />
                <Label htmlFor="lock-add-objective" className="font-normal cursor-pointer">
                  5. Add Objective
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-delete-objective"
                  checked={lockDeleteObjective}
                  onCheckedChange={(checked) => setLockDeleteObjective(checked === true)}
                />
                <Label htmlFor="lock-delete-objective" className="font-normal cursor-pointer">
                  6. Delete Objective
                </Label>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              💡 <strong>Note:</strong> Monthly Actual locks only affect objectives with "Direct" in their type. 
              All other locks affect both "Direct" and "In direct" objectives.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {lock ? 'Update Lock Rule' : 'Create Lock Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
