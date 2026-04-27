import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { APP_ROUTE_OPTIONS } from '@/config/appRoutes';
import { mergePowerbiCatalogRows, getPowerbiRoutingCatalog } from '@/config/powerbi';
import { getPowerbiDashboards, POWERBI_DASHBOARDS_QUERY_KEY } from '@/services/configService';
import type { AccountUser, AccountPayload } from '@/types/config';
import { getDepartments } from '@/services/wigService';
import type { Department } from '@/types/wig';

const ROLE_OPTIONS = ['CEO', 'Admin', 'department', 'project', 'Viewer'] as const;

const DEPT_SELECT_NONE = '__none__';
const DEPT_SELECT_ALL = 'all';

function normDeptCode(code: string | undefined | null): string {
  return String(code ?? '')
    .trim()
    .toLowerCase();
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountUser | null;
  onSuccess: () => void;
  createAccount: (p: AccountPayload & { username: string; password: string; role: string }) => Promise<unknown>;
  updateAccount: (id: number, p: AccountPayload) => Promise<unknown>;
};

export default function UserForm({
  open,
  onOpenChange,
  account,
  onSuccess,
  createAccount,
  updateAccount,
}: Props) {
  const isEdit = !!account?.id;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('department');
  /** Single department code, "all", or none */
  const [departmentValue, setDepartmentValue] = useState<string>(DEPT_SELECT_NONE);
  const [isActive, setIsActive] = useState(true);
  const [defaultRoute, setDefaultRoute] = useState<string>('');
  const [routesInherit, setRoutesInherit] = useState(true);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [pbiInherit, setPbiInherit] = useState(true);
  const [selectedPbi, setSelectedPbi] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
    enabled: open,
    staleTime: 60_000,
  });

  const { data: pbiRows, isLoading: pbiCatalogLoading } = useQuery({
    queryKey: POWERBI_DASHBOARDS_QUERY_KEY,
    queryFn: getPowerbiDashboards,
    enabled: open,
    staleTime: 60_000,
  });

  const pbiDashboards = useMemo(() => {
    if (pbiRows && pbiRows.length > 0) {
      return mergePowerbiCatalogRows(pbiRows);
    }
    return getPowerbiRoutingCatalog();
  }, [pbiRows]);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setUsername(account.username);
      setPassword('');
      setRole(account.role);
      const ds = account.departments || [];
      if (ds.some((x) => String(x).toLowerCase() === 'all')) {
        setDepartmentValue(DEPT_SELECT_ALL);
      } else if (ds.length > 0) {
        setDepartmentValue(normDeptCode(ds[0]));
      } else {
        setDepartmentValue(DEPT_SELECT_NONE);
      }
      setIsActive(!!account.is_active);
      setDefaultRoute(account.default_route || '');
      const ar = account.allowed_routes;
      setRoutesInherit(ar === null || ar === undefined);
      setSelectedRoutes(ar && Array.isArray(ar) ? [...ar] : []);
      const pbi = account.powerbi_dashboard_ids;
      setPbiInherit(pbi === null || pbi === undefined);
      setSelectedPbi(pbi && Array.isArray(pbi) ? [...pbi] : []);
    } else {
      setUsername('');
      setPassword('');
      setRole('department');
      setDepartmentValue(DEPT_SELECT_NONE);
      setIsActive(true);
      setDefaultRoute('');
      setRoutesInherit(true);
      setSelectedRoutes([]);
      setPbiInherit(true);
      setSelectedPbi([]);
    }
  }, [open, account, departments]);

  function departmentsPayload(): string[] {
    if (departmentValue === DEPT_SELECT_NONE) return [];
    if (departmentValue === DEPT_SELECT_ALL) return ['all'];
    return [departmentValue];
  }

  const knownDeptCodes = new Set(departments.map((d) => normDeptCode(d.code)));
  const orphanDept =
    departmentValue !== DEPT_SELECT_NONE &&
    departmentValue !== DEPT_SELECT_ALL &&
    !knownDeptCodes.has(departmentValue);

  const toggleRoute = (path: string, checked: boolean) => {
    setSelectedRoutes((prev) => (checked ? [...prev, path] : prev.filter((p) => p !== path)));
  };

  const togglePbi = (id: string, checked: boolean) => {
    setSelectedPbi((prev) => (checked ? [...prev, id] : prev.filter((p) => p !== id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (role === 'department' && departmentValue === DEPT_SELECT_NONE) {
        toast({
          title: 'Department required',
          description: 'Choose a department for users with the “department” role.',
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
      const departments = departmentsPayload();
      const payload: AccountPayload = {
        username: username.trim(),
        role,
        departments,
        is_active: isActive,
        default_route: defaultRoute ? defaultRoute : null,
        allowed_routes: routesInherit ? null : [...selectedRoutes],
        powerbi_dashboard_ids: pbiInherit ? null : [...selectedPbi],
      };

      if (isEdit && account) {
        if (!password.trim()) {
          delete payload.password;
        } else {
          payload.password = password;
        }
        await updateAccount(account.id, payload);
      } else {
        if (!password.trim()) {
          throw new Error('Password is required for new users');
        }
        await createAccount({
          ...payload,
          username: username.trim(),
          password,
          role,
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Could not save user',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] min-h-0 flex flex-col gap-0 p-0 overflow-hidden md:max-w-xl">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle>{isEdit ? 'Edit user' : 'Add user'}</DialogTitle>
          <DialogDescription>
            Passwords are stored as a secure hash. Leave password blank when editing to keep the current password.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 [scrollbar-gutter:stable]">
            <div className="space-y-4 pb-4 pr-1">
              <div className="space-y-2">
                <Label htmlFor="acc-username">Username</Label>
                <Input
                  id="acc-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="min-h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-password">{isEdit ? 'New password (optional)' : 'Password'}</Label>
                <Input
                  id="acc-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isEdit ? 'new-password' : 'new-password'}
                  className="min-h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                {departmentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-11">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading departments…
                  </div>
                ) : (
                  <Select value={departmentValue} onValueChange={setDepartmentValue}>
                    <SelectTrigger className="min-h-11 w-full">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEPT_SELECT_NONE}>None</SelectItem>
                      <SelectItem value={DEPT_SELECT_ALL}>All departments</SelectItem>
                      {orphanDept && (
                        <SelectItem value={departmentValue}>
                          Current: {departmentValue}
                        </SelectItem>
                      )}
                      {departments.map((d: Department) => {
                        const v = normDeptCode(d.code);
                        return (
                          <SelectItem key={d.id} value={v}>
                            {d.name} ({d.code})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[10px] text-muted-foreground">
                  One department per user (stored as a single code). Use “All departments” for org-wide access where needed.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <Label htmlFor="acc-active" className="cursor-pointer">
                  Active
                </Label>
                <Switch id="acc-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <div className="space-y-2">
                <Label>Default route after sign-in</Label>
                <Select value={defaultRoute || '__inherit__'} onValueChange={(v) => setDefaultRoute(v === '__inherit__' ? '' : v)}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="Use role default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__inherit__">Use role default</SelectItem>
                    {APP_ROUTE_OPTIONS.map((o) => (
                      <SelectItem key={o.path} value={o.path}>
                        {o.label} ({o.path})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Page access</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="routes-inherit"
                      checked={routesInherit}
                      onCheckedChange={(c) => setRoutesInherit(c === true)}
                    />
                    <label htmlFor="routes-inherit" className="text-xs text-muted-foreground cursor-pointer">
                      Inherit from role
                    </label>
                  </div>
                </div>
                {!routesInherit && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {APP_ROUTE_OPTIONS.map((o) => (
                      <div key={o.path} className="flex items-center gap-2">
                        <Checkbox
                          id={`route-${o.path}`}
                          checked={selectedRoutes.includes(o.path)}
                          onCheckedChange={(c) => toggleRoute(o.path, c === true)}
                        />
                        <label htmlFor={`route-${o.path}`} className="text-xs truncate">
                          {o.label}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Power BI dashboards</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pbi-inherit"
                      checked={pbiInherit}
                      onCheckedChange={(c) => setPbiInherit(c === true)}
                    />
                    <label htmlFor="pbi-inherit" className="text-xs text-muted-foreground cursor-pointer">
                      Inherit from role
                    </label>
                  </div>
                </div>
                {!pbiInherit && (
                  <>
                    <p className="text-[10px] text-muted-foreground">
                      Only the dashboards you check here appear on the Power BI page (sign-in uses the latest saved list).
                    </p>
                    {pbiCatalogLoading && pbiRows === undefined ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 min-h-11">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                        Loading dashboard list…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        {pbiDashboards.map((d) => (
                          <div key={d.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`pbi-${d.id}`}
                              checked={selectedPbi.includes(d.id)}
                              onCheckedChange={(c) => togglePbi(d.id, c === true)}
                            />
                            <label htmlFor={`pbi-${d.id}`} className="text-xs">
                              {d.title}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-4 py-3 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || departmentsLoading}>
              {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
