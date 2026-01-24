import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPermissions, type UserPermission } from '@/services/configService';
import { getUsers, type User } from '@/services/configService';
import { getDepartments } from '@/services/wigService';
import { Loader2 } from 'lucide-react';
import type { Department } from '@/types/wig';

export default function PermissionMatrix() {
  const { data: permissions = [], isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => getPermissions(),
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => getUsers(),
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
  });

  if (permissionsLoading || usersLoading || departmentsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading permission matrix...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group permissions by user
  const permissionsByUser = new Map<number, UserPermission[]>();
  permissions.forEach(perm => {
    if (!permissionsByUser.has(perm.user_id)) {
      permissionsByUser.set(perm.user_id, []);
    }
    permissionsByUser.get(perm.user_id)!.push(perm);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permission Matrix</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          View permissions by user, department, and KPI
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {users.map((user) => {
            const userPermissions = permissionsByUser.get(user.id) || [];
            if (userPermissions.length === 0) return null;

            return (
              <div key={user.id} className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3">{user.username} ({user.role})</h4>
                <div className="space-y-2">
                  {userPermissions.map((perm) => (
                    <div key={perm.id} className="flex items-center gap-4 text-sm">
                      <span className="font-medium w-32">
                        {perm.department_name || 'All Departments'}
                      </span>
                      <span className="text-muted-foreground w-48 truncate">
                        {perm.kpi || 'All KPIs'}
                      </span>
                      <div className="flex gap-1">
                        {perm.can_view && <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">View</span>}
                        {perm.can_edit_target && <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded text-xs">Edit Target</span>}
                        {perm.can_edit_monthly_target && <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded text-xs">Edit Monthly Target</span>}
                        {perm.can_edit_monthly_actual && <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900 rounded text-xs">Edit Monthly Actual</span>}
                        {perm.can_view_reports && <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 rounded text-xs">View Reports</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
