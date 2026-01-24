import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getLocks, type FieldLock } from '@/services/configService';
import { getDepartmentObjectives } from '@/services/wigService';
import { getDepartments } from '@/services/wigService';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Department } from '@/types/wig';
import type { DepartmentObjective } from '@/types/wig';

export default function LockVisualMap() {
  const [selectedDepartment, setSelectedDepartment] = useState<number | null>(null);

  const { data: locks = [], isLoading: locksLoading } = useQuery({
    queryKey: ['field-locks'],
    queryFn: () => getLocks(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
  });

  const { data: objectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ['department-objectives', selectedDepartment],
    queryFn: () => getDepartmentObjectives(selectedDepartment ? { department_id: selectedDepartment } : undefined),
    enabled: true,
  });

  // Filter to only Direct type objectives
  const directObjectives = objectives.filter(obj => obj.type === 'Direct');

  // Check if an objective is locked
  const isObjectiveLocked = (objective: DepartmentObjective): boolean => {
    // This is a simplified check - in production, you'd want to check against actual lock rules
    // For now, we'll just show which objectives are Direct type
    return true; // All Direct objectives are potentially lockable
  };

  if (locksLoading || objectivesLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading visual map...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group objectives by department and KPI
  const groupedObjectives = new Map<string, DepartmentObjective[]>();
  directObjectives.forEach(obj => {
    const key = `${obj.department_id}-${obj.kpi}`;
    if (!groupedObjectives.has(key)) {
      groupedObjectives.set(key, []);
    }
    groupedObjectives.get(key)!.push(obj);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Lock Visual Map</CardTitle>
          <Select
            value={selectedDepartment?.toString() || 'all'}
            onValueChange={(value) => setSelectedDepartment(value === 'all' ? null : parseInt(value))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id.toString()}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Showing only Direct type objectives (locks only apply to Direct type)
        </p>
      </CardHeader>
      <CardContent>
        {directObjectives.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No Direct type objectives found{selectedDepartment ? ' for selected department' : ''}.
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedObjectives.entries()).map(([key, objs]) => {
              const dept = departments.find(d => d.id === objs[0].department_id);
              return (
                <div key={key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{dept?.name || 'Unknown Department'}</h4>
                      <p className="text-sm text-muted-foreground">{objs[0].kpi}</p>
                    </div>
                    <Badge variant="outline">{objs.length} objective(s)</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {objs.map((obj) => (
                      <div
                        key={obj.id}
                        className="p-2 border rounded bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                      >
                        <div className="text-xs font-medium">ID: {obj.id}</div>
                        <div className="text-xs text-muted-foreground truncate">{obj.activity}</div>
                        <Badge variant="secondary" className="mt-1 text-xs">Direct</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
