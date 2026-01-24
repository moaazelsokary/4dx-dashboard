import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getUsers, type User } from '@/services/configService';
import { getDepartments } from '@/services/wigService';
import { getKPIsWithRASCI } from '@/services/wigService';
import type { LogFilters as LogFiltersType, ActionType } from '@/types/config';
import type { Department } from '@/types/wig';
import { X } from 'lucide-react';

interface LogFiltersProps {
  filters: LogFiltersType;
  onFiltersChange: (filters: LogFiltersType) => void;
}

const ACTION_TYPES: ActionType[] = [
  'lock_created',
  'lock_deleted',
  'lock_updated',
  'value_edited',
  'permission_created',
  'permission_updated',
  'permission_deleted',
];

export default function LogFilters({ filters, onFiltersChange }: LogFiltersProps) {
  const [localFilters, setLocalFilters] = useState<LogFiltersType>(filters);

  const { data: users = [] } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => getUsers(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => getKPIsWithRASCI(),
  });

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleFilterChange = (key: keyof LogFiltersType, value: any) => {
    const newFilters = { ...localFilters, [key]: value, page: 1 }; // Reset to page 1 on filter change
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const cleared: LogFiltersType = { page: 1, limit: 50 };
    setLocalFilters(cleared);
    onFiltersChange(cleared);
  };

  const hasActiveFilters = !!(
    localFilters.user_id ||
    localFilters.action_type ||
    localFilters.date_from ||
    localFilters.date_to ||
    localFilters.kpi ||
    localFilters.department_id ||
    localFilters.search
  );

  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>User</Label>
            <Select
              value={localFilters.user_id?.toString() || ''}
              onValueChange={(value) => handleFilterChange('user_id', value ? parseInt(value) : undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select
              value={localFilters.action_type || ''}
              onValueChange={(value) => handleFilterChange('action_type', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All actions</SelectItem>
                {ACTION_TYPES.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={localFilters.department_id?.toString() || ''}
              onValueChange={(value) => handleFilterChange('department_id', value ? parseInt(value) : undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>KPI</Label>
            <Select
              value={localFilters.kpi || ''}
              onValueChange={(value) => handleFilterChange('kpi', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All KPIs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All KPIs</SelectItem>
                {kpis.slice(0, 100).map((kpi) => (
                  <SelectItem key={kpi} value={kpi}>
                    {kpi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date From</Label>
            <Input
              type="date"
              value={localFilters.date_from || ''}
              onChange={(e) => handleFilterChange('date_from', e.target.value || undefined)}
            />
          </div>

          <div className="space-y-2">
            <Label>Date To</Label>
            <Input
              type="date"
              value={localFilters.date_to || ''}
              onChange={(e) => handleFilterChange('date_to', e.target.value || undefined)}
            />
          </div>

          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Search logs..."
              value={localFilters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
            />
          </div>

          <div className="space-y-2 flex items-end">
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="w-full"
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
