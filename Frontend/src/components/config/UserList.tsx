import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createAccount,
  updateAccount,
  getAccounts,
  getPowerbiDashboards,
  POWERBI_DASHBOARDS_QUERY_KEY,
} from '@/services/configService';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { AccountUser } from '@/types/config';
import {
  getDashboardFromCatalog,
  getAccessibleDashboards,
  mergePowerbiCatalogRows,
  getPowerbiRoutingCatalog,
  type DashboardConfig,
} from '@/config/powerbi';
import { APP_ROUTE_OPTIONS } from '@/config/appRoutes';
import UserForm from './UserForm';

function routeLabel(path: string): string {
  return APP_ROUTE_OPTIONS.find((o) => o.path === path)?.label || path;
}

function summarizeRoutes(a: AccountUser): string {
  if (a.allowed_routes === null || a.allowed_routes === undefined) return 'Default (role)';
  if (a.allowed_routes.length === 0) return 'None';
  return a.allowed_routes.map(routeLabel).join(', ');
}

function summarizePbi(a: AccountUser, catalog: DashboardConfig[]): string {
  if (a.powerbi_dashboard_ids === null || a.powerbi_dashboard_ids === undefined) return 'Default (role)';
  if (a.powerbi_dashboard_ids.length === 0) return 'None';
  return a.powerbi_dashboard_ids
    .map((id) => getDashboardFromCatalog(catalog, id)?.title || id)
    .join(', ');
}

/** Effective dashboard ids for display: inherit → role rules; [] → none; else explicit */
function effectivePbiIdSet(row: AccountUser, catalog: DashboardConfig[]): Set<string> {
  const raw = row.powerbi_dashboard_ids;
  if (raw === null || raw === undefined) {
    return new Set(getAccessibleDashboards(row.role, row.departments || [], catalog).map((d) => d.id));
  }
  if (raw.length === 0) return new Set();
  return new Set(raw);
}

function pbiColumnAbbrev(d: DashboardConfig): string {
  const first = d.name.trim().split(/\s+/)[0] || d.id;
  return first.length > 10 ? `${first.slice(0, 8)}…` : first;
}

function formatDepartmentCell(row: AccountUser): string {
  const d = row.departments || [];
  if (d.length === 0) return '—';
  if (d.some((x) => String(x).toLowerCase() === 'all')) return 'All';
  return d.map((c) => String(c)).join(', ');
}

export default function UserList() {
  const [editing, setEditing] = useState<AccountUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: accounts = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => getAccounts(),
    /** Poll only when tab is healthy — avoids hammering a down proxy */
    refetchInterval: (query) => (query.state.status === 'error' ? false : 30000),
    retry: 1,
  });

  const { data: pbiRows } = useQuery({
    queryKey: POWERBI_DASHBOARDS_QUERY_KEY,
    queryFn: getPowerbiDashboards,
    staleTime: 60_000,
  });

  const pbiCatalog = useMemo(() => {
    if (pbiRows?.length) return mergePowerbiCatalogRows(pbiRows);
    return getPowerbiRoutingCatalog();
  }, [pbiRows]);

  const createMut = useMutation({
    mutationFn: createAccount,
    onSuccess: (newUser) => {
      queryClient.setQueryData(['accounts'], (old: AccountUser[] | undefined) => {
        const list = old ?? [];
        const next = [...list.filter((u) => u.id !== newUser.id), newUser];
        next.sort((a, b) => a.username.localeCompare(b.username));
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User created' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message || 'Create failed', variant: 'destructive' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateAccount>[1] }) =>
      updateAccount(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['accounts'], (old: AccountUser[] | undefined) => {
        const list = old ?? [];
        return list.map((u) => (u.id === updated.id ? updated : u));
      });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User updated' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message || 'Update failed', variant: 'destructive' });
    },
  });

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (row: AccountUser) => {
    setEditing(row);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading users…</div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Could not load users';
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load users</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{msg}</p>
              <p className="text-xs opacity-90">
                In local development, start the auth proxy on port 3000 (e.g. <code className="rounded bg-background px-1">node auth-proxy.cjs</code> from the Frontend folder) and restart Vite so requests to{' '}
                <code className="rounded bg-background px-1">/.netlify/functions/config-api</code> are proxied. Also run the SQL migration{' '}
                <code className="rounded bg-background px-1">database/users-extended-columns.sql</code> if sign-in or accounts fail.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-x-hidden max-w-full">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <CardTitle>Users</CardTitle>
              {isFetching && !isLoading && (
                <span className="text-[10px] text-muted-foreground">Refreshing…</span>
              )}
            </div>
            <Button onClick={handleAdd} size="sm" className="min-h-11 shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Add user
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {accounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No users returned from the server. If you expected a list, check the database connection and that the auth proxy is running (local dev).
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="min-w-[100px]">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Default route</TableHead>
                  <TableHead className="hidden lg:table-cell max-w-[180px]">Pages</TableHead>
                  <TableHead className="md:hidden min-w-[120px]">Power BI</TableHead>
                  {pbiCatalog.map((d) => (
                    <TableHead
                      key={d.id}
                      className="hidden md:table-cell text-center text-[10px] font-medium px-1 max-w-[52px]"
                      title={d.title}
                    >
                      {pbiColumnAbbrev(d)}
                    </TableHead>
                  ))}
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((row) => {
                  const pbiSet = effectivePbiIdSet(row, pbiCatalog);
                  return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.username}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm" title={formatDepartmentCell(row)}>
                      {formatDepartmentCell(row)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                      {row.default_route || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs max-w-[200px]" title={summarizeRoutes(row)}>
                      {summarizeRoutes(row)}
                    </TableCell>
                    <TableCell className="md:hidden text-[10px] text-muted-foreground max-w-[120px]" title={summarizePbi(row, pbiCatalog)}>
                      {summarizePbi(row, pbiCatalog)}
                    </TableCell>
                    {pbiCatalog.map((d) => (
                      <TableCell key={d.id} className="hidden md:table-cell text-center px-1">
                        {pbiSet.has(d.id) ? (
                          <span className="text-green-600 dark:text-green-400" aria-label={`${d.title}: yes`}>
                            ✓
                          </span>
                        ) : (
                          <span className="text-muted-foreground" aria-label={`${d.title}: no`}>
                            —
                          </span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.is_active ? (
                        <Badge variant="outline">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => handleEdit(row)} aria-label="Edit user">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        createAccount={async (p) => {
          await createMut.mutateAsync(p);
        }}
        updateAccount={async (id, p) => {
          await updateMut.mutateAsync({ id, payload: p });
        }}
        onSuccess={() => {
          setEditing(null);
        }}
      />
    </>
  );
}
