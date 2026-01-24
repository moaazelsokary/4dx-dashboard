import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type ActivityLog } from '@/types/config';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface LogDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: ActivityLog | null;
}

export default function LogDetailsModal({ open, onOpenChange, log }: LogDetailsModalProps) {
  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
              <p className="text-sm">{format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">User</label>
              <p className="text-sm">{log.username} (ID: {log.user_id})</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Action Type</label>
              <p className="text-sm">
                <Badge>{log.action_type.replace('_', ' ')}</Badge>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Target Field</label>
              <p className="text-sm">{log.target_field || '-'}</p>
            </div>
            {log.kpi && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">KPI</label>
                <p className="text-sm">{log.kpi}</p>
              </div>
            )}
            {log.department_name && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Department</label>
                <p className="text-sm">{log.department_name}</p>
              </div>
            )}
            {log.month && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Month</label>
                <p className="text-sm">{log.month}</p>
              </div>
            )}
          </div>

          {(log.old_value !== null || log.new_value !== null) && (
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Value Changes</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Old Value</label>
                  <p className="text-sm font-mono">{log.old_value !== null ? log.old_value : '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">New Value</label>
                  <p className="text-sm font-mono">{log.new_value !== null ? log.new_value : '-'}</p>
                </div>
              </div>
            </div>
          )}

          {log.metadata && (
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Metadata</h4>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
