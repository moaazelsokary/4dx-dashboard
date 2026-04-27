import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/hooks/use-toast';
import {
  getPowerbiDashboards,
  createPowerbiDashboard,
  updatePowerbiDashboard,
  deletePowerbiDashboard,
  POWERBI_DASHBOARDS_QUERY_KEY,
} from '@/services/configService';
import type { PowerbiDashboardRecord } from '@/types/config';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

export default function PowerbiDashboardList() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PowerbiDashboardRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PowerbiDashboardRecord | null>(null);
  const [idField, setIdField] = useState('');
  const [nameField, setNameField] = useState('');
  const [titleField, setTitleField] = useState('');
  const [embedUrlField, setEmbedUrlField] = useState('');
  const [sortOrderField, setSortOrderField] = useState('100');

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: POWERBI_DASHBOARDS_QUERY_KEY,
    queryFn: getPowerbiDashboards,
    staleTime: 30_000,
  });

  const openCreate = () => {
    setEditing(null);
    setIdField('');
    setNameField('');
    setTitleField('');
    setEmbedUrlField('');
    setSortOrderField('100');
    setFormOpen(true);
  };

  const openEdit = (row: PowerbiDashboardRecord) => {
    setEditing(row);
    setIdField(row.id);
    setNameField(row.name);
    setTitleField(row.title);
    setEmbedUrlField(row.embed_url || '');
    setSortOrderField(String(row.sort_order ?? 0));
    setFormOpen(true);
  };

  const createMut = useMutation({
    mutationFn: createPowerbiDashboard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POWERBI_DASHBOARDS_QUERY_KEY });
      toast({ title: 'Dashboard added' });
      setFormOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: 'Could not add dashboard', description: e.message, variant: 'destructive' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updatePowerbiDashboard>[1] }) =>
      updatePowerbiDashboard(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POWERBI_DASHBOARDS_QUERY_KEY });
      toast({ title: 'Dashboard updated' });
      setFormOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: 'Could not update dashboard', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deletePowerbiDashboard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POWERBI_DASHBOARDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({ title: 'Dashboard removed' });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Could not delete dashboard', description: e.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sort_order = parseInt(sortOrderField, 10);
    if (editing) {
      updateMut.mutate({
        id: editing.id,
        payload: {
          name: nameField.trim(),
          title: titleField.trim(),
          embed_url: embedUrlField.trim(),
          sort_order: Number.isFinite(sort_order) ? sort_order : editing.sort_order,
        },
      });
    } else {
      createMut.mutate({
        id: idField.trim().toLowerCase(),
        name: nameField.trim(),
        title: titleField.trim(),
        embed_url: embedUrlField.trim(),
        sort_order: Number.isFinite(sort_order) ? sort_order : 100,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
          Loading Power BI catalog…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          <p className="text-destructive">{error instanceof Error ? error.message : 'Could not load catalog'}</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-x-hidden max-w-full">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Power BI dashboards</CardTitle>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Define embed URLs and labels. These entries appear as choices when editing users (Power BI dashboards — turn off
                &quot;Inherit from role&quot;). Only Admin and CEO can change this list.
              </p>
            </div>
            <Button type="button" onClick={openCreate} size="sm" className="min-h-11 shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Add dashboard
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Title</TableHead>
                <TableHead className="hidden lg:table-cell max-w-[200px]">Embed URL</TableHead>
                <TableHead className="w-20 text-right">Order</TableHead>
                <TableHead className="text-right w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{row.title}</TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px] truncate text-xs" title={row.embed_url || ''}>
                    {row.embed_url || '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">{row.sort_order}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11"
                      aria-label={`Edit ${row.id}`}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11 text-destructive"
                      aria-label={`Delete ${row.id}`}
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit dashboard' : 'Add dashboard'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update label, embed URL, or sort order. The id cannot be changed.'
                : 'Use a stable id (lowercase letters, digits, underscore). Users reference this id in permissions.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="pbi-id">Id</Label>
                <Input
                  id="pbi-id"
                  value={idField}
                  onChange={(e) => setIdField(e.target.value)}
                  placeholder="e.g. operations_kpi"
                  className="min-h-11 font-mono"
                  required
                  autoComplete="off"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pbi-name">Name</Label>
              <Input
                id="pbi-name"
                value={nameField}
                onChange={(e) => setNameField(e.target.value)}
                required
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pbi-title">Title</Label>
              <Input
                id="pbi-title"
                value={titleField}
                onChange={(e) => setTitleField(e.target.value)}
                required
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pbi-embed">Embed URL</Label>
              <Input
                id="pbi-embed"
                value={embedUrlField}
                onChange={(e) => setEmbedUrlField(e.target.value)}
                placeholder="https://app.powerbi.com/..."
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pbi-sort">Sort order</Label>
              <Input
                id="pbi-sort"
                type="number"
                value={sortOrderField}
                onChange={(e) => setSortOrderField(e.target.value)}
                className="min-h-11"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Saving…' : editing ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[min(100vw-2rem,28rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleteTarget?.id} from the catalog. User accounts that still list this id may need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
