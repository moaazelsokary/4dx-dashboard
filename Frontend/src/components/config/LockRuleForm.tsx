import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { createLock, updateLock, type FieldLock, type LockRuleFormData } from '@/services/configService';
import { getUsers, type User } from '@/services/configService';
import { getDepartments } from '@/services/wigService';
import { getKPIsWithRASCI } from '@/services/wigService';
import { getDepartmentObjectives } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { Loader2, Search, X, ChevronDown, Info } from 'lucide-react';
import type { Department } from '@/types/wig';
import { cn } from '@/lib/utils';

interface LockRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lock?: FieldLock | null;
  onSuccess: () => void;
}

export default function LockRuleForm({ open, onOpenChange, lock, onSuccess }: LockRuleFormProps) {
  const queryClient = useQueryClient();
  const [scopeType, setScopeType] = useState<'all_users' | 'specific_users' | 'specific_kpi' | 'department_kpi' | 'all_department_objectives'>('all_users');
  const [lockType, setLockType] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedKPI, setSelectedKPI] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<number | null>(null);
  const [excludeMonthlyTarget, setExcludeMonthlyTarget] = useState(false);
  const [excludeMonthlyActual, setExcludeMonthlyActual] = useState(false);
  const [excludeAnnualTarget, setExcludeAnnualTarget] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSelectOpen, setUserSelectOpen] = useState(false);

  // Load data
  const { data: users = [] } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => getUsers(),
    enabled: open && (scopeType === 'specific_users' || scopeType === 'all_department_objectives'),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
    enabled: open && scopeType === 'department_kpi',
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => getKPIsWithRASCI(),
    enabled: open && (scopeType === 'specific_kpi' || scopeType === 'department_kpi'),
  });

  // Load department objectives for preview
  const { data: departmentObjectives = [] } = useQuery({
    queryKey: ['department-objectives', selectedDepartment, selectedKPI],
    queryFn: () => getDepartmentObjectives(selectedDepartment ? { department_id: selectedDepartment } : undefined),
    enabled: open && (scopeType === 'department_kpi' || scopeType === 'specific_kpi'),
  });

  const createMutation = useMutation({
    mutationFn: (data: LockRuleFormData) => createLock(data),
    onSuccess: () => {
      // Invalidate all lock status queries to force immediate refetch
      queryClient.invalidateQueries({ queryKey: ['lockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['batchLockStatus'] });
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
    onSuccess: () => {
      // Invalidate all lock status queries to force immediate refetch for live updates
      queryClient.invalidateQueries({ queryKey: ['lockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['batchLockStatus'] });
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
      setScopeType(lock.scope_type as any);
      if (Array.isArray(lock.lock_type)) {
        setLockType(lock.lock_type);
      } else if (lock.lock_type) {
        setLockType([lock.lock_type]);
      }
      if (lock.user_ids) {
        setSelectedUsers(Array.isArray(lock.user_ids) ? lock.user_ids : []);
      }
      setSelectedKPI(lock.kpi || '');
      setSelectedDepartment(lock.department_id || null);
      setExcludeMonthlyTarget(lock.exclude_monthly_target || false);
      setExcludeMonthlyActual(lock.exclude_monthly_actual || false);
      setExcludeAnnualTarget(lock.exclude_annual_target || false);
    } else if (open && !lock) {
      // Reset form for new lock
      setScopeType('all_users');
      setLockType([]);
      setSelectedUsers([]);
      setSelectedKPI('');
      setSelectedDepartment(null);
      setExcludeMonthlyTarget(false);
      setExcludeMonthlyActual(false);
      setExcludeAnnualTarget(false);
    }
  }, [lock, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (scopeType === 'all_department_objectives') {
      // For all_department_objectives, lock_type is automatically set
      const formData: LockRuleFormData = {
        lock_type: 'all_department_objectives',
        scope_type: scopeType,
        user_ids: selectedUsers.length > 0 ? selectedUsers : undefined,
        exclude_monthly_target: excludeMonthlyTarget,
        exclude_monthly_actual: excludeMonthlyActual,
        exclude_annual_target: excludeAnnualTarget,
      };
      if (lock?.id) {
        updateMutation.mutate({ id: lock.id, data: formData });
      } else {
        createMutation.mutate(formData);
      }
    } else {
      if (lockType.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select at least one field to lock',
          variant: 'destructive',
        });
        return;
      }

      if (scopeType === 'specific_users' && selectedUsers.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select at least one user',
          variant: 'destructive',
        });
        return;
      }

      if ((scopeType === 'specific_kpi' || scopeType === 'department_kpi') && !selectedKPI) {
        toast({
          title: 'Validation Error',
          description: 'Please select a KPI',
          variant: 'destructive',
        });
        return;
      }

      if (scopeType === 'department_kpi' && !selectedDepartment) {
        toast({
          title: 'Validation Error',
          description: 'Please select a department',
          variant: 'destructive',
        });
        return;
      }

      const formData: LockRuleFormData = {
        lock_type: lockType.length === 1 ? lockType[0] : lockType,
        scope_type: scopeType,
        user_ids: scopeType === 'specific_users' ? selectedUsers : undefined,
        kpi: (scopeType === 'specific_kpi' || scopeType === 'department_kpi') ? selectedKPI : undefined,
        department_id: scopeType === 'department_kpi' ? selectedDepartment || undefined : undefined,
      };

      if (lock?.id) {
        updateMutation.mutate({ id: lock.id, data: formData });
      } else {
        createMutation.mutate(formData);
      }
    }
  };

  // Calculate affected objectives count
  const affectedObjectives = departmentObjectives.filter(obj => obj.type === 'Direct').length;
  const skippedObjectives = departmentObjectives.filter(obj => obj.type !== 'Direct').length;

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lock ? 'Edit Lock Rule' : 'Create Lock Rule'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info message */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
            <Info className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Locks only apply to department objectives with type = 'Direct'. 
              Objectives with other types (In direct, M&E, M&E MOV) will not be locked.
            </p>
          </div>

          {/* Scope Type */}
          <div className="space-y-3">
            <Label>Scope Type</Label>
            <RadioGroup value={scopeType} onValueChange={(value) => setScopeType(value as any)}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all_department_objectives" id="scope-all-dept" />
                  <Label htmlFor="scope-all-dept" className="font-normal cursor-pointer">
                    All Department Objectives
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all_users" id="scope-all-users" />
                  <Label htmlFor="scope-all-users" className="font-normal cursor-pointer">
                    All Users (for specific fields)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific_users" id="scope-specific-users" />
                  <Label htmlFor="scope-specific-users" className="font-normal cursor-pointer">
                    Specific Users (for specific fields)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific_kpi" id="scope-specific-kpi" />
                  <Label htmlFor="scope-specific-kpi" className="font-normal cursor-pointer">
                    Specific KPI
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="department_kpi" id="scope-dept-kpi" />
                  <Label htmlFor="scope-dept-kpi" className="font-normal cursor-pointer">
                    Department KPI
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* All Department Objectives specific fields */}
          {scopeType === 'all_department_objectives' && (
            <>
              <div className="space-y-3">
                <Label>User Scope</Label>
                <RadioGroup
                  value={selectedUsers.length > 0 ? 'specific' : 'all'}
                  onValueChange={(value) => {
                    if (value === 'all') {
                      setSelectedUsers([]);
                    }
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="user-all" />
                      <Label htmlFor="user-all" className="font-normal cursor-pointer">All Users</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="specific" id="user-specific" />
                      <Label htmlFor="user-specific" className="font-normal cursor-pointer">Specific Users</Label>
                    </div>
                  </div>
                </RadioGroup>

                {selectedUsers.length > 0 || userSelectOpen ? (
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
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setUserSelectOpen(true)}
                    className="w-full"
                  >
                    Select Users
                  </Button>
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

              <div className="space-y-3">
                <Label>Exclusions</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exclude-monthly-target"
                      checked={excludeMonthlyTarget}
                      onCheckedChange={(checked) => setExcludeMonthlyTarget(checked === true)}
                    />
                    <Label htmlFor="exclude-monthly-target" className="font-normal cursor-pointer">
                      Exclude Monthly Target (monthly_target remains unlocked for Direct & In direct types)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exclude-monthly-actual"
                      checked={excludeMonthlyActual}
                      onCheckedChange={(checked) => setExcludeMonthlyActual(checked === true)}
                    />
                    <Label htmlFor="exclude-monthly-actual" className="font-normal cursor-pointer">
                      Exclude Monthly Actual (monthly_actual remains unlocked for Direct type only)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exclude-annual"
                      checked={excludeAnnualTarget}
                      onCheckedChange={(checked) => setExcludeAnnualTarget(checked === true)}
                    />
                    <Label htmlFor="exclude-annual" className="font-normal cursor-pointer">
                      Exclude Annual Target (activity_target remains unlocked for Direct & In direct types)
                    </Label>
                  </div>
                </div>
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium mb-2">📋 What gets locked:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    {!excludeMonthlyTarget && (
                      <li>Monthly Target (Direct & In direct)</li>
                    )}
                    {!excludeMonthlyActual && (
                      <li>Monthly Actual (<span className="text-orange-600 font-medium">Direct only</span>)</li>
                    )}
                    {!excludeAnnualTarget && (
                      <li>Annual Target / activity_target (Direct & In direct)</li>
                    )}
                    <li>Activity field (Direct & In direct)</li>
                    <li>Responsible Person (Direct & In direct)</li>
                    <li>MOV field (Direct & In direct)</li>
                  </ul>
                  {!excludeMonthlyTarget && !excludeMonthlyActual && !excludeAnnualTarget && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ⚠️ All fields will be locked (no exclusions selected)
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Field-specific lock types */}
          {scopeType !== 'all_department_objectives' && (
            <div className="space-y-3">
              <Label>Fields to Lock</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lock-target"
                    checked={lockType.includes('target')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setLockType([...lockType, 'target']);
                      } else {
                        setLockType(lockType.filter(t => t !== 'target'));
                      }
                    }}
                  />
                  <Label htmlFor="lock-target" className="font-normal cursor-pointer">
                    Target (activity_target) - <span className="text-xs text-muted-foreground">Applies to Direct & In direct</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lock-monthly-target"
                    checked={lockType.includes('monthly_target')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setLockType([...lockType, 'monthly_target']);
                      } else {
                        setLockType(lockType.filter(t => t !== 'monthly_target'));
                      }
                    }}
                  />
                  <Label htmlFor="lock-monthly-target" className="font-normal cursor-pointer">
                    Monthly Target - <span className="text-xs text-muted-foreground">Applies to Direct & In direct</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lock-monthly-actual"
                    checked={lockType.includes('monthly_actual')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setLockType([...lockType, 'monthly_actual']);
                      } else {
                        setLockType(lockType.filter(t => t !== 'monthly_actual'));
                      }
                    }}
                  />
                  <Label htmlFor="lock-monthly-actual" className="font-normal cursor-pointer">
                    Monthly Actual - <span className="text-xs text-orange-600 font-medium">Direct type ONLY</span>
                  </Label>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                💡 <strong>Type Restrictions:</strong> Monthly Actual locks only affect objectives with "Direct" in their type. 
                All other locks affect both "Direct" and "In direct" objectives.
              </p>
            </div>
          )}

          {/* Specific Users selection */}
          {scopeType === 'specific_users' && (
            <div className="space-y-3">
              <Label>Select Users</Label>
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
          )}

          {/* KPI Selection */}
          {(scopeType === 'specific_kpi' || scopeType === 'department_kpi') && (
            <div className="space-y-3">
              <Label>KPI</Label>
              <Select value={selectedKPI} onValueChange={setSelectedKPI}>
                <SelectTrigger>
                  <SelectValue placeholder="Select KPI" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-[300px]">
                    {kpis.map((kpi) => (
                      <SelectItem key={kpi} value={kpi}>
                        {kpi}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Department Selection */}
          {scopeType === 'department_kpi' && (
            <div className="space-y-3">
              <Label>Department</Label>
              <Select
                value={selectedDepartment?.toString() || ''}
                onValueChange={(value) => setSelectedDepartment(value ? parseInt(value) : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview summary */}
          {(scopeType === 'specific_kpi' || scopeType === 'department_kpi') && selectedKPI && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">Preview:</p>
              <p className="text-sm text-muted-foreground">
                Will lock <strong>{affectedObjectives}</strong> Direct objectives
                {skippedObjectives > 0 && (
                  <>, <strong>{skippedObjectives}</strong> non-Direct will be skipped</>
                )}
              </p>
            </div>
          )}

          {scopeType === 'all_department_objectives' && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">Summary:</p>
              <p className="text-sm text-muted-foreground">
                Will lock entire department_objectives table for{' '}
                {selectedUsers.length > 0 ? `${selectedUsers.length} selected user(s)` : 'all users'}
                {(() => {
                  const exclusions = [];
                  if (excludeMonthlyTarget) exclusions.push('monthly target');
                  if (excludeMonthlyActual) exclusions.push('monthly actual');
                  if (excludeAnnualTarget) exclusions.push('annual target');
                  
                  if (exclusions.length > 0) {
                    return <>, excluding {exclusions.join(', ')}</>;
                  }
                  return null;
                })()}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {lock ? 'Update' : 'Create'} Lock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
