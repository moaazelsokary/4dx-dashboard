import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createOrUpdatePermission, type UserPermission, type PermissionFormData } from '@/services/configService';
import { getUsers, type User } from '@/services/configService';
import { getDepartments } from '@/services/wigService';
import { getKPIsWithRASCI } from '@/services/wigService';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Department } from '@/types/wig';

interface PermissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission?: UserPermission | null;
  onSuccess: () => void;
}

export default function PermissionForm({ open, onOpenChange, permission, onSuccess }: PermissionFormProps) {
  const [userId, setUserId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [kpi, setKpi] = useState<string>('');
  const [canView, setCanView] = useState(true);
  const [canEditTarget, setCanEditTarget] = useState(false);
  const [canEditMonthlyTarget, setCanEditMonthlyTarget] = useState(false);
  const [canEditMonthlyActual, setCanEditMonthlyActual] = useState(false);
  const [canViewReports, setCanViewReports] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => getUsers(),
    enabled: open,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
    enabled: open,
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => getKPIsWithRASCI(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (data: PermissionFormData) => createOrUpdatePermission(data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: permission ? 'Permission updated successfully' : 'Permission created successfully',
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save permission',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (permission && open) {
      setUserId(permission.user_id);
      setDepartmentId(permission.department_id || null);
      setKpi(permission.kpi || '');
      setCanView(permission.can_view);
      setCanEditTarget(permission.can_edit_target);
      setCanEditMonthlyTarget(permission.can_edit_monthly_target);
      setCanEditMonthlyActual(permission.can_edit_monthly_actual);
      setCanViewReports(permission.can_view_reports);
    } else if (open && !permission) {
      // Reset form
      setUserId(null);
      setDepartmentId(null);
      setKpi('');
      setCanView(true);
      setCanEditTarget(false);
      setCanEditMonthlyTarget(false);
      setCanEditMonthlyActual(false);
      setCanViewReports(false);
    }
  }, [permission, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a user',
        variant: 'destructive',
      });
      return;
    }

    const formData: PermissionFormData = {
      user_id: userId,
      department_id: departmentId || null,
      kpi: kpi || null,
      can_view: canView,
      can_edit_target: canEditTarget,
      can_edit_monthly_target: canEditMonthlyTarget,
      can_edit_monthly_actual: canEditMonthlyActual,
      can_view_reports: canViewReports,
    };

    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{permission ? 'Edit Permission' : 'Create Permission'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="user">User *</Label>
            <Select
              value={userId?.toString() || ''}
              onValueChange={(value) => setUserId(parseInt(value))}
              disabled={!!permission}
            >
              <SelectTrigger id="user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.username} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label htmlFor="department">Department (optional - leave empty for all departments)</Label>
            <Select
              value={departmentId?.toString() || 'all'}
              onValueChange={(value) => setDepartmentId(value !== 'all' ? parseInt(value) : null)}
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label htmlFor="kpi">KPI (optional - leave empty for all KPIs)</Label>
            <Select
              value={kpi || 'all'}
              onValueChange={(value) => setKpi(value !== 'all' ? value : '')}
            >
              <SelectTrigger id="kpi">
                <SelectValue placeholder="All KPIs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All KPIs</SelectItem>
                {kpis.slice(0, 100).map((kpiOption) => (
                  <SelectItem key={kpiOption} value={kpiOption}>
                    {kpiOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Feature Permissions</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can-view"
                  checked={canView}
                  onCheckedChange={(checked) => setCanView(checked === true)}
                />
                <Label htmlFor="can-view" className="font-normal cursor-pointer">Can View</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can-edit-target"
                  checked={canEditTarget}
                  onCheckedChange={(checked) => setCanEditTarget(checked === true)}
                />
                <Label htmlFor="can-edit-target" className="font-normal cursor-pointer">Can Edit Target</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can-edit-monthly-target"
                  checked={canEditMonthlyTarget}
                  onCheckedChange={(checked) => setCanEditMonthlyTarget(checked === true)}
                />
                <Label htmlFor="can-edit-monthly-target" className="font-normal cursor-pointer">Can Edit Monthly Target</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can-edit-monthly-actual"
                  checked={canEditMonthlyActual}
                  onCheckedChange={(checked) => setCanEditMonthlyActual(checked === true)}
                />
                <Label htmlFor="can-edit-monthly-actual" className="font-normal cursor-pointer">Can Edit Monthly Actual</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="can-view-reports"
                  checked={canViewReports}
                  onCheckedChange={(checked) => setCanViewReports(checked === true)}
                />
                <Label htmlFor="can-view-reports" className="font-normal cursor-pointer">Can View Reports</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {permission ? 'Update' : 'Create'} Permission
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
