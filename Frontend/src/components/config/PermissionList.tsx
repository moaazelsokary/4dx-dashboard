import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getPermissions, deletePermission, type UserPermission } from '@/services/configService';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2 } from 'lucide-react';
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
import PermissionForm from './PermissionForm';

export default function PermissionList() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionToDelete, setPermissionToDelete] = useState<UserPermission | null>(null);
  const [editingPermission, setEditingPermission] = useState<UserPermission | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => getPermissions(),
    refetchInterval: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePermission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      toast({
        title: 'Success',
        description: 'Permission deleted successfully',
      });
      setDeleteDialogOpen(false);
      setPermissionToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete permission',
        variant: 'destructive',
      });
    },
  });

  const handleAdd = () => {
    setEditingPermission(null);
    setFormOpen(true);
  };

  const handleEdit = (permission: UserPermission) => {
    setEditingPermission(permission);
    setFormOpen(true);
  };

  const handleDelete = (permission: UserPermission) => {
    setPermissionToDelete(permission);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (permissionToDelete?.id) {
      deleteMutation.mutate(permissionToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading permissions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Permissions</CardTitle>
            <Button onClick={handleAdd} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Permission
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No permissions found. Create your first permission rule to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>KPI</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm) => (
                  <TableRow key={perm.id}>
                    <TableCell>{perm.username || `User ${perm.user_id}`}</TableCell>
                    <TableCell>{perm.department_name || 'All Departments'}</TableCell>
                    <TableCell className="max-w-xs truncate" title={perm.kpi || ''}>
                      {perm.kpi || 'All KPIs'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {perm.can_view && <Badge variant="outline">View</Badge>}
                        {perm.can_edit_target && <Badge variant="outline">Edit Target</Badge>}
                        {perm.can_edit_monthly_target && <Badge variant="outline">Edit Monthly Target</Badge>}
                        {perm.can_edit_monthly_actual && <Badge variant="outline">Edit Monthly Actual</Badge>}
                        {perm.can_view_reports && <Badge variant="outline">View Reports</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(perm)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(perm)}
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

      <PermissionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        permission={editingPermission}
        onSuccess={() => {
          setFormOpen(false);
          setEditingPermission(null);
          queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this permission rule?
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
