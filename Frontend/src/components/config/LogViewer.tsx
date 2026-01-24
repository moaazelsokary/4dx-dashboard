import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getLogs, exportLogs, type ActivityLog, type LogFilters } from '@/services/configService';
import { toast } from '@/hooks/use-toast';
import { Download, Eye } from 'lucide-react';
import LogFilters from './LogFilters';
import LogDetailsModal from './LogDetailsModal';
import { format } from 'date-fns';

export default function LogViewer() {
  const [filters, setFilters] = useState<LogFilters>({
    page: 1,
    limit: 50,
  });
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activity-logs', filters],
    queryFn: async () => {
      console.log('[LogViewer] Fetching logs with filters:', filters);
      const result = await getLogs(filters);
      console.log('[LogViewer] Received logs:', result);
      return result;
    },
    refetchInterval: 10000, // Poll every 10 seconds for real-time updates
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;

  console.log('[LogViewer] Current state:', {
    isLoading,
    hasError: !!error,
    error: error?.message,
    logsCount: logs.length,
    data,
  });

  const handleExport = async () => {
    try {
      const blob = await exportLogs(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: 'Success',
        description: 'Logs exported successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to export logs',
        variant: 'destructive',
      });
    }
  };

  const getActionBadgeVariant = (actionType: string) => {
    switch (actionType) {
      case 'lock_created':
      case 'permission_created':
        return 'default';
      case 'lock_deleted':
      case 'permission_deleted':
        return 'destructive';
      case 'value_edited':
      case 'lock_updated':
      case 'permission_updated':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading logs...</div>
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
              <CardTitle>Activity Logs</CardTitle>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <LogFilters filters={filters} onFiltersChange={setFilters} />

            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No logs found matching your filters.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target Field</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Old Value</TableHead>
                      <TableHead>New Value</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}
                        </TableCell>
                        <TableCell>{log.username}</TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action_type)}>
                            {log.action_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.target_field || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate" title={log.kpi || ''}>
                          {log.kpi || '-'}
                        </TableCell>
                        <TableCell>{log.department_name || '-'}</TableCell>
                        <TableCell>{log.old_value !== null ? log.old_value : '-'}</TableCell>
                        <TableCell>{log.new_value !== null ? log.new_value : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLog(log);
                              setDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                        disabled={!filters.page || filters.page <= 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                        disabled={!pagination || filters.page || 1 >= pagination.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <LogDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        log={selectedLog}
      />
    </>
  );
}
