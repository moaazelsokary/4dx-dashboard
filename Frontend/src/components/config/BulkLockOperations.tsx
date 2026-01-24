import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { bulkCreateLocks, bulkDeleteLocks, type LockRuleFormData } from '@/services/configService';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, Trash2 } from 'lucide-react';
import LockRuleForm from './LockRuleForm';

export default function BulkLockOperations() {
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const bulkCreateMutation = useMutation({
    mutationFn: (locks: LockRuleFormData[]) => bulkCreateLocks(locks),
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: `${data.length} lock rules created successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['field-locks'] });
      // Invalidate all lock status queries to force immediate refetch for live updates
      queryClient.invalidateQueries({ queryKey: ['lockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['batchLockStatus'] });
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create locks',
        variant: 'destructive',
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => bulkDeleteLocks(ids),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Locks deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['field-locks'] });
      // Invalidate all lock status queries to force immediate refetch for live updates
      queryClient.invalidateQueries({ queryKey: ['lockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['batchLockStatus'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete locks',
        variant: 'destructive',
      });
    },
  });

  // This component can be expanded later with CSV import/export functionality
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Operations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={() => setFormOpen(true)}
            variant="outline"
            disabled={bulkCreateMutation.isPending}
          >
            <Upload className="w-4 h-4 mr-2" />
            Create Multiple Locks
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Use the lock form to create individual locks. Bulk operations can be added here in the future.
        </p>
      </CardContent>
    </Card>
  );
}
