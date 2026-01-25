import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getLocks, deleteLock, type FieldLock } from '@/services/configService';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Lock as LockIcon, Unlock } from 'lucide-react';
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
import LockRuleForm from './LockRuleFormNew';
import LockVisualMap from './LockVisualMap';

export default function LockRuleList() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lockToDelete, setLockToDelete] = useState<FieldLock | null>(null);
  const [editingLock, setEditingLock] = useState<FieldLock | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showVisualMap, setShowVisualMap] = useState(false);
  const queryClient = useQueryClient();

  const { data: locks = [], isLoading } = useQuery({
    queryKey: ['field-locks'],
    queryFn: () => getLocks(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLock(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['field-locks'] });
      // Invalidate and refetch all lock status queries immediately for live updates
      await queryClient.invalidateQueries({ queryKey: ['lockStatus'], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['batchLockStatus'], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ['lockStatus'], type: 'active' });
      await queryClient.refetchQueries({ queryKey: ['batchLockStatus'], type: 'active' });
      toast({
        title: 'Success',
        description: 'Lock deleted successfully',
      });
      setDeleteDialogOpen(false);
      setLockToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete lock',
        variant: 'destructive',
      });
    },
  });

  const handleAdd = () => {
    setEditingLock(null);
    setFormOpen(true);
  };

  const handleEdit = (lock: FieldLock) => {
    setEditingLock(lock);
    setFormOpen(true);
  };

  const handleDelete = (lock: FieldLock) => {
    setLockToDelete(lock);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (lockToDelete?.id) {
      deleteMutation.mutate(lockToDelete.id);
    }
  };

  const getScopeDescription = (lock: FieldLock): string => {
    if (lock.scope_type === 'hierarchical') {
      // New hierarchical structure
      const userDesc = lock.user_scope === 'all' ? 'All Users' : 
                       lock.user_scope === 'specific' ? `${Array.isArray(lock.user_ids) ? lock.user_ids.length : 0} User(s)` : 
                       'No Users';
      const kpiDesc = lock.kpi_scope === 'all' ? 'All KPIs' : 
                     lock.kpi_scope === 'specific' ? `${Array.isArray(lock.kpi_ids) ? lock.kpi_ids.length : 0} KPI(s)` : 
                     'No KPIs';
      const objDesc = lock.objective_scope === 'all' ? 'All Objectives' : 
                      lock.objective_scope === 'specific' ? `${Array.isArray(lock.objective_ids) ? lock.objective_ids.length : 0} Objective(s)` : 
                      'No Objectives';
      
      const fields = [];
      if (lock.lock_annual_target) fields.push('Annual Target');
      if (lock.lock_monthly_target) fields.push('Monthly Target');
      if (lock.lock_monthly_actual) fields.push('Monthly Actual');
      if (lock.lock_all_other_fields) fields.push('Other Fields');
      if (lock.lock_add_objective) fields.push('Add Objective');
      if (lock.lock_delete_objective) fields.push('Delete Objective');
      
      return `Hierarchical: ${userDesc} → ${kpiDesc} → ${objDesc} | Fields: ${fields.join(', ') || 'None'}`;
    }
    
    // Legacy scope types
    switch (lock.scope_type) {
      case 'all_users':
        return 'All Users';
      case 'specific_users':
        return `Specific Users (${Array.isArray(lock.user_ids) ? lock.user_ids.length : 0})`;
      case 'specific_kpi':
        return `KPI: ${lock.kpi || 'N/A'}`;
      case 'department_kpi':
        return `${lock.department_name || 'Department'} - ${lock.kpi || 'KPI'}`;
      case 'specific_objective':
        const objectiveName = lock.department_objective_activity || 'Objective';
        return `${lock.department_name || 'Department'} - ${objectiveName}${lock.department_objective_id ? ` (ID: ${lock.department_objective_id})` : ''}`;
      case 'all_department_objectives':
        const exclusions = [];
        if (lock.exclude_monthly_target) exclusions.push('Monthly Target');
        if (lock.exclude_monthly_actual) exclusions.push('Monthly Actual');
        if (lock.exclude_annual_target) exclusions.push('Annual Target');
        const userScope = Array.isArray(lock.user_ids) && lock.user_ids.length > 0 
          ? `Users: ${lock.user_ids.length}` 
          : 'All Users';
        return `All Department Objectives (${userScope}${exclusions.length > 0 ? `, Excluding: ${exclusions.join(', ')}` : ''})`;
      default:
        return lock.scope_type || 'Unknown';
    }
  };

  const getLockTypeDescription = (lock: FieldLock): string => {
    if (lock.lock_type === 'all_department_objectives') {
      return 'All Fields';
    }
    if (Array.isArray(lock.lock_type)) {
      return lock.lock_type.join(', ');
    }
    return lock.lock_type || 'N/A';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading locks...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Field Locks</CardTitle>
              <div className="flex gap-2">
                <Button onClick={() => setShowVisualMap(!showVisualMap)} variant="outline" size="sm">
                  {showVisualMap ? <Unlock className="w-4 h-4 mr-2" /> : <LockIcon className="w-4 h-4 mr-2" />}
                  {showVisualMap ? 'Hide' : 'Show'} Visual Map
                </Button>
                <Button onClick={handleAdd} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Lock
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showVisualMap ? (
              <LockVisualMap />
            ) : locks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No locks found. Create your first lock rule to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lock Type</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locks.map((lock) => (
                    <TableRow key={lock.id}>
                      <TableCell>
                        <Badge variant="outline">{getLockTypeDescription(lock)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate" title={getScopeDescription(lock)}>
                          {getScopeDescription(lock)}
                        </div>
                      </TableCell>
                      <TableCell>{lock.created_by_username || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {lock.created_at
                          ? new Date(lock.created_at).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(lock)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(lock)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <LockRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lock={editingLock}
        onSuccess={() => {
          setFormOpen(false);
          setEditingLock(null);
          queryClient.invalidateQueries({ queryKey: ['field-locks'] });
          // Lock status queries are already invalidated in LockRuleForm
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lock</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lock rule? This will unlock all fields that were locked by this rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
